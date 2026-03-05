import { Plugin, PluginType, PluginConfig } from './types.ts';
import { ThemePlugin } from './theme/interface.ts';
import { ProviderPlugin } from './provider/interface.ts';
import { SessionPlugin } from './session/interface.ts';
import { MFAPlugin } from './mfa/interface.ts';
import { ExtensionPlugin } from './extension/interface.ts';

interface LoadedPlugins {
    theme: ThemePlugin[];
    provider: ProviderPlugin | null;
    session: SessionPlugin | null;
    mfa: MFAPlugin[];
    extension: ExtensionPlugin[];
}

let defaultThemeName: string = '';

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
    session: ['getAdapterConstructor', 'set', 'get', 'del', 'isConnected'],
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

async function loadPlugin<T extends Plugin>(
    type: PluginType,
    name: string,
    config: PluginConfig
): Promise<T> {
    const pluginPath = new URL(
        `../plugins-available/${type}s/${name}/index.ts`,
        import.meta.url
    ).href;

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

    console.log(`Plugin loaded: ${type}/${name} v${plugin.meta.version}`);
    return plugin as T;
}

/** Parse comma-separated env value into array of names */
function parseList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
}

/** Discover all available plugin directories for a given type */
async function discoverAvailable(type: PluginType): Promise<string[]> {
    const { readdirSync, statSync } = await import('node:fs');
    const baseDir = new URL(`../plugins-available/${type}s/`, import.meta.url);
    try {
        const entries = readdirSync(baseDir);
        return entries.filter(name => {
            try {
                return statSync(new URL(name, baseDir)).isDirectory();
            } catch {
                return false;
            }
        });
    } catch {
        return [];
    }
}

export interface PluginSelections {
    provider: string;
    session: string;
    theme: string;       // default theme name
    mfa: string;         // comma-separated
    extensions: string;  // comma-separated
}

export async function initializePlugins(
    selections: PluginSelections,
    config: PluginConfig
): Promise<void> {
    defaultThemeName = selections.theme;

    // Load session first (other plugins may depend on cache)
    plugins.session = await loadPlugin<SessionPlugin>('session', selections.session, config);

    // Provider (single active)
    plugins.provider = await loadPlugin<ProviderPlugin>('provider', selections.provider, config);

    // MFA plugins (multiple active)
    const mfaNames = parseList(selections.mfa);
    for (const name of mfaNames) {
        const mfa = await loadPlugin<MFAPlugin>('mfa', name, config);
        plugins.mfa.push(mfa);
    }

    // Theme plugins (load all available, default set by config)
    const availableThemes = await discoverAvailable('theme');
    for (const name of availableThemes) {
        try {
            const theme = await loadPlugin<ThemePlugin>('theme', name, config);
            plugins.theme.push(theme);
        } catch (err: any) {
            // Non-default themes failing to load is a warning, not fatal
            if (name === defaultThemeName) throw err;
            console.warn(`Theme "${name}" failed to load: ${err.message}`);
        }
    }

    // Ensure default theme was loaded
    if (!plugins.theme.find(t => t.meta.name === defaultThemeName)) {
        throw new Error(`Default theme "${defaultThemeName}" not found among available themes`);
    }

    // Extension plugins (multiple active)
    const extensionNames = parseList(selections.extensions);
    for (const name of extensionNames) {
        const ext = await loadPlugin<ExtensionPlugin>('extension', name, config);
        plugins.extension.push(ext);
    }
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
