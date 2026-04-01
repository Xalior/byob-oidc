import { Plugin, PluginType, PluginConfig, PluginServices } from './types.ts';
import { ThemePlugin } from './theme/interface.ts';
import { ProviderPlugin } from './provider/interface.ts';
import { SessionPlugin } from './session/interface.ts';
import { MFAPlugin } from './mfa/interface.ts';
import { ExtensionPlugin } from './extension/interface.ts';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';

interface LoadedPlugins {
    theme: ThemePlugin[];
    provider: ProviderPlugin | null;
    session: SessionPlugin | null;
    mfa: MFAPlugin[];
    extension: ExtensionPlugin[];
}

let defaultThemeName: string = '';
let externalPluginDir: string = '';

const plugins: LoadedPlugins = {
    theme: [],
    provider: null,
    session: null,
    mfa: [],
    extension: [],
};

const REQUIRED_METHODS: Record<PluginType, string[]> = {
    theme: ['page', 'logout', 'loggedout', 'error', 'layoutsDir', 'assetsDir'],
    provider: ['authenticate', 'findAccount', 'getClaims'],
    session: ['getAdapterConstructor', 'set', 'get', 'del', 'isConnected', 'setClientFinder'],
    mfa: ['requiresChallenge', 'issueChallenge', 'verifyChallenge'],
    extension: [], // extensions have no required methods — all are optional hooks
};

function validatePlugin(plugin: any, type: PluginType): void {
    if (!plugin) {
        throw new Error(`Plugin for type "${type}" is null or undefined`);
    }

    if (!plugin.meta) {
        throw new Error(`Plugin for type "${type}" is missing "meta" property`);
    }

    if (plugin.meta.type !== type) {
        throw new Error(
            `Plugin "${plugin.meta.name}" declares type "${plugin.meta.type}" but is being loaded as "${type}"`
        );
    }

    if (!plugin.meta.name || !plugin.meta.version) {
        throw new Error(`Plugin for type "${type}" is missing meta.name or meta.version`);
    }

    if (typeof plugin.initialize !== 'function') {
        throw new Error(`Plugin "${plugin.meta.name}" is missing required initialize() method`);
    }

    const required = REQUIRED_METHODS[type];
    for (const method of required) {
        if (typeof plugin[method] !== 'function') {
            throw new Error(
                `Plugin "${plugin.meta.name}" (${type}) is missing required method: ${method}()`
            );
        }
    }
}

/** Map plugin type to its directory name under plugins-available/ and external dir */
const TYPE_DIRS: Record<PluginType, string> = {
    theme: 'themes',
    provider: 'providers',
    session: 'sessions',
    mfa: 'mfa',
    extension: 'extensions',
};

/**
 * Resolve the import path for a plugin. Checks:
 * 1. External dir: $PLUGIN_DIR/{type}/{name}/index.js
 * 2. Built-in:     src/plugins-available/{type}/{name}/index.ts
 *
 * External plugins (prebuilt JS) take precedence over built-in (TypeScript).
 */
function resolvePluginPath(type: PluginType, name: string): { href: string; external: boolean } {
    // Check external directory first
    if (externalPluginDir) {
        const externalDir = path.join(externalPluginDir, TYPE_DIRS[type], name);
        const jsEntry = path.join(externalDir, 'index.js');
        if (existsSync(jsEntry)) {
            return { href: pathToFileURL(jsEntry).href, external: true };
        }
    }

    // Fall back to built-in plugins-available (TypeScript source)
    const builtinPath = new URL(
        `../plugins-available/${TYPE_DIRS[type]}/${name}/index.ts`,
        import.meta.url
    ).href;
    return { href: builtinPath, external: false };
}

async function loadPlugin<T extends Plugin>(
    type: PluginType,
    name: string,
    config: PluginConfig
): Promise<T> {
    const { href: pluginPath, external } = resolvePluginPath(type, name);

    let module: any;
    try {
        module = await import(pluginPath);
    } catch (err: any) {
        throw new Error(
            `Failed to load ${type} plugin "${name}" from ${pluginPath}: ${err.message}`
        );
    }

    const plugin = module.default;
    if (!plugin) {
        throw new Error(
            `Plugin "${name}" (${type}) does not have a default export`
        );
    }

    validatePlugin(plugin, type);

    try {
        await plugin.initialize(config);
    } catch (err: any) {
        throw new Error(
            `Plugin "${name}" (${type}) failed during initialize(): ${err.message}`
        );
    }

    const source = external ? 'external' : 'built-in';
    console.log(`Plugin loaded: ${type}/${name} v${plugin.meta.version} (${source})`);
    return plugin as T;
}

/**
 * Load multiple plugins of the same type, pushing each into the target array.
 * Failures are logged as warnings and skipped, unless the plugin name matches
 * `fatalName` — in which case the error is re-thrown (e.g. the default theme).
 */
async function loadPluginList<T extends Plugin>(
    type: PluginType,
    names: string[],
    config: PluginConfig,
    target: T[],
    fatalName?: string
): Promise<void> {
    for (const name of names) {
        try {
            const plugin = await loadPlugin<T>(type, name, config);
            target.push(plugin);
        } catch (err: any) {
            if (name === fatalName) throw err;
            console.warn(`${type} plugin "${name}" failed to load: ${err.message}`);
        }
    }
}

/** Parse comma-separated env value into array of names */
function parseList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
}

/** List subdirectories of a given path */
function listSubdirectories(dirPath: string): string[] {
    if (!existsSync(dirPath)) return [];
    try {
        return readdirSync(dirPath).filter(name => {
            try {
                return statSync(path.join(dirPath, name)).isDirectory();
            } catch {
                return false;
            }
        });
    } catch {
        return [];
    }
}

/**
 * Discover all available plugin directories for a given type.
 * Scans both built-in and external directories; external overrides built-in.
 */
function discoverAvailable(type: PluginType): string[] {
    const typeDir = TYPE_DIRS[type];

    // Built-in plugins
    const builtinBase = new URL(`../plugins-available/${typeDir}/`, import.meta.url);
    let builtinPath: string;
    try {
        builtinPath = new URL(builtinBase).pathname;
    } catch {
        builtinPath = '';
    }
    const builtinNames = listSubdirectories(builtinPath);

    // External plugins
    const externalNames: string[] = externalPluginDir
        ? listSubdirectories(path.join(externalPluginDir, typeDir))
        : [];

    // Merge: external takes precedence (deduplicate)
    const seen = new Set<string>();
    const result: string[] = [];

    for (const name of externalNames) {
        seen.add(name);
        result.push(name);
    }

    for (const name of builtinNames) {
        if (!seen.has(name)) {
            result.push(name);
        }
    }

    return result;
}

export interface PluginSelections {
    provider: string;
    session: string;
    theme: string;       // default theme name
    mfa: string;         // comma-separated
    extensions: string;  // comma-separated
    plugin_dir?: string; // external plugin directory
}

export async function initializePlugins(
    selections: PluginSelections,
    config: PluginConfig
): Promise<void> {
    defaultThemeName = selections.theme;
    externalPluginDir = selections.plugin_dir || '';

    if (externalPluginDir) {
        if (existsSync(externalPluginDir)) {
            console.log(`External plugin directory: ${externalPluginDir}`);
        } else {
            console.log(`External plugin directory not found: ${externalPluginDir} (skipping)`);
            externalPluginDir = '';
        }
    }

    // Load session first (other plugins may depend on cache)
    plugins.session = await loadPlugin<SessionPlugin>('session', selections.session, config);

    // Now that session is loaded, inject services into config for subsequent plugins
    const { transporter } = await import('../lib/email.ts');
    const services: PluginServices = {
        getSession: () => getSession(),
        transporter,
    };
    const configWithServices: PluginConfig = { ...config, services };

    // Provider (single active)
    plugins.provider = await loadPlugin<ProviderPlugin>('provider', selections.provider, configWithServices);

    // MFA plugins (multiple active)
    await loadPluginList<MFAPlugin>('mfa', parseList(selections.mfa), configWithServices, plugins.mfa);

    // Theme plugins (load all available; default theme failure is fatal)
    await loadPluginList<ThemePlugin>('theme', discoverAvailable('theme'), configWithServices, plugins.theme, defaultThemeName);

    // Ensure default theme was loaded
    if (!plugins.theme.find(t => t.meta.name === defaultThemeName)) {
        throw new Error(`Default theme "${defaultThemeName}" not found among available themes`);
    }

    // Extension plugins (multiple active)
    await loadPluginList<ExtensionPlugin>('extension', parseList(selections.extensions), configWithServices, plugins.extension);
}

// --- Accessors ---

export function getTheme(name?: string): ThemePlugin {
    const target = name || defaultThemeName;
    const theme = plugins.theme.find(t => t.meta.name === target);
    if (!theme) throw new Error(`Theme "${target}" not loaded`);
    return theme;
}

export function getThemes(): ThemePlugin[] {
    return [...plugins.theme];
}

export function getProvider(): ProviderPlugin {
    if (!plugins.provider) throw new Error('Provider plugin not loaded');
    return plugins.provider;
}

export function getSession(): SessionPlugin {
    if (!plugins.session) throw new Error('Session plugin not loaded');
    return plugins.session;
}

export function getMFA(name?: string): MFAPlugin {
    if (name) {
        const mfa = plugins.mfa.find(m => m.meta.name === name);
        if (!mfa) throw new Error(`MFA plugin "${name}" not loaded`);
        return mfa;
    }
    if (plugins.mfa.length === 0) throw new Error('No MFA plugins loaded');
    return plugins.mfa[0];
}

export function getMFAs(): MFAPlugin[] {
    return [...plugins.mfa];
}

export function getExtensions(): ExtensionPlugin[] {
    return [...plugins.extension];
}

export async function shutdownPlugins(): Promise<void> {
    const allPlugins: Plugin[] = [
        ...plugins.theme,
        ...plugins.mfa,
        ...plugins.extension,
        ...(plugins.provider ? [plugins.provider] : []),
        ...(plugins.session ? [plugins.session] : []),
    ];

    for (const plugin of allPlugins) {
        if (plugin.shutdown) {
            try {
                await plugin.shutdown();
                console.log(`Plugin shutdown: ${plugin.meta.type}/${plugin.meta.name}`);
            } catch (err: any) {
                console.error(`Plugin shutdown error (${plugin.meta.type}/${plugin.meta.name}): ${err.message}`);
            }
        }
    }
}
