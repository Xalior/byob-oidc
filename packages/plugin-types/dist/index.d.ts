/**
 * @byob-oidc/plugin-types
 *
 * Type definitions for building BYOB-OIDC plugins.
 * Install as a dev dependency in your plugin project:
 *
 *   npm install --save-dev @byob-oidc/plugin-types
 *
 * Then import types:
 *
 *   import type { ProviderPlugin, MFAPlugin, PluginConfig } from '@byob-oidc/plugin-types';
 */
import type { Request, Application } from 'express';
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
export interface PluginServices {
    /** Get the active session plugin (cache: set/get/del) */
    getSession(): SessionPlugin;
    /** Nodemailer transporter for sending emails */
    transporter: any;
}
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
export interface OIDCAccount {
    accountId: string;
    claims(use: string, scope: string): Promise<Record<string, any>>;
}
export interface ProviderPlugin extends Plugin {
    meta: PluginMeta & {
        type: 'provider';
    };
    authenticate(req: Request): Promise<OIDCAccount | null>;
    findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null>;
    getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>>;
    getRoutes?(app: Application): void;
    externalAuth?: boolean;
    getExternalLoginUrl?(returnTo: string): Promise<string>;
    handleExternalCallback?(req: Request): Promise<OIDCAccount | null>;
}
export type AdapterConstructor = new (name: string) => OIDCAdapter;
export interface OIDCAdapter {
    upsert(id: string, payload: any, expiresIn?: number): Promise<void>;
    find(id: string): Promise<any | undefined>;
    findByUserCode(userCode: string): Promise<any | undefined | void>;
    findByUid(uid: string): Promise<any | undefined | void>;
    consume(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    revokeByGrantId(grantId: string): Promise<void>;
}
export interface SessionPlugin extends Plugin {
    meta: PluginMeta & {
        type: 'session';
    };
    getAdapterConstructor(): AdapterConstructor;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    get(key: string): Promise<any | undefined>;
    del(key: string): Promise<void>;
    isConnected(): boolean;
    setClientFinder(finder: (id: string) => Promise<any>): void;
}
export interface MFAPlugin extends Plugin {
    meta: PluginMeta & {
        type: 'mfa';
    };
    requiresChallenge(account: OIDCAccount): Promise<boolean>;
    issueChallenge(account: OIDCAccount, req: Request): Promise<string>;
    verifyChallenge(challengeId: string, req: Request): Promise<boolean>;
}
export interface ThemePlugin extends Plugin {
    meta: PluginMeta & {
        type: 'theme';
    };
    site_name: string;
    page(html: string): string;
    logout(form: string, hostname: string): string;
    loggedout(display: string): string;
    error(html: string): string;
    layoutsDir(): string | null;
    assetsDir(): string;
}
export interface ExtensionPlugin extends Plugin {
    meta: PluginMeta & {
        type: 'extension';
    };
    getRoutes?(app: Application): void;
    getMiddleware?(app: Application): void;
    getClaims?(accountId: string): Promise<Record<string, any>>;
    getScopes?(): string[];
}
