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

/**
 * Service accessors injected into PluginConfig.
 * External plugins use these instead of importing from core source paths.
 */
export interface PluginServices {
    /** Get the active session plugin (cache: set/get/del) */
    getSession(): any;
    /** Nodemailer transporter for sending emails */
    transporter: any;
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
    /** Service accessors — available after session plugin is loaded */
    services?: PluginServices;
}
