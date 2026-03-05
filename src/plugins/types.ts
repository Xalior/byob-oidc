import { Application } from 'express';

export type PluginType = 'theme' | 'provider' | 'session' | 'mfa' | 'extension';

export interface PluginMeta {
    name: string;
    version: string;
    type: PluginType;
    description?: string;
}

export interface Plugin {
    meta: PluginMeta;
    initialize(config: PluginConfig): Promise<void>;
    shutdown?(): Promise<void>;
}

/** Core config subset passed to plugins during initialize() */
export interface PluginConfig {
    hostname: string;
    site_name: string;
    mode: string;
    provider_url: string;
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string | undefined;
            pass: string | undefined;
        };
    };
    debug: {
        adapter: boolean;
        account: boolean;
    };
}
