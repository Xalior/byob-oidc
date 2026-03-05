import { Plugin, PluginType, PluginConfig } from './types.ts';
import { ThemePlugin } from './theme/interface.ts';
import { ProviderPlugin } from './provider/interface.ts';
import { SessionPlugin } from './session/interface.ts';
import { MFAPlugin } from './mfa/interface.ts';

interface LoadedPlugins {
    theme: ThemePlugin | null;
    provider: ProviderPlugin | null;
    session: SessionPlugin | null;
    mfa: MFAPlugin | null;
}

const plugins: LoadedPlugins = {
    theme: null,
    provider: null,
    session: null,
    mfa: null,
};

const REQUIRED_METHODS: Record<PluginType, string[]> = {
    theme: ['page', 'logout', 'loggedout', 'error', 'layoutsDir', 'assetsDir'],
    provider: ['authenticate', 'findAccount', 'getClaims'],
    session: ['getAdapterConstructor', 'set', 'get', 'del', 'isConnected'],
    mfa: ['requiresChallenge', 'issueChallenge', 'verifyChallenge'],
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

export async function initializePlugins(
    selections: { theme: string; provider: string; session: string; mfa: string },
    config: PluginConfig
): Promise<void> {
    // Load session first (other plugins may depend on cache)
    plugins.session = await loadPlugin<SessionPlugin>('session', selections.session, config);

    // Then provider and MFA (independent of each other)
    plugins.provider = await loadPlugin<ProviderPlugin>('provider', selections.provider, config);
    plugins.mfa = await loadPlugin<MFAPlugin>('mfa', selections.mfa, config);

    // Theme last (purely presentational)
    plugins.theme = await loadPlugin<ThemePlugin>('theme', selections.theme, config);
}

export function getTheme(): ThemePlugin {
    if (!plugins.theme) throw new Error('Theme plugin not loaded');
    return plugins.theme;
}

export function getProvider(): ProviderPlugin {
    if (!plugins.provider) throw new Error('Provider plugin not loaded');
    return plugins.provider;
}

export function getSession(): SessionPlugin {
    if (!plugins.session) throw new Error('Session plugin not loaded');
    return plugins.session;
}

export function getMFA(): MFAPlugin {
    if (!plugins.mfa) throw new Error('MFA plugin not loaded');
    return plugins.mfa;
}

export async function shutdownPlugins(): Promise<void> {
    for (const [type, plugin] of Object.entries(plugins)) {
        if (plugin?.shutdown) {
            try {
                await plugin.shutdown();
                console.log(`Plugin shutdown: ${type}/${plugin.meta.name}`);
            } catch (err: any) {
                console.error(`Plugin shutdown error (${type}/${plugin.meta.name}): ${err.message}`);
            }
        }
    }
}
