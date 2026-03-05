import { Plugin, PluginMeta } from '../types.ts';
import { Application } from 'express';

export interface ExtensionPlugin extends Plugin {
    meta: PluginMeta & { type: 'extension' };

    /** Register routes on the Express app */
    getRoutes?(app: Application): void;

    /** Add Express middleware (runs before routes) */
    getMiddleware?(app: Application): void;

    /** Expose additional OIDC claims this extension provides for an account */
    getClaims?(accountId: string): Promise<Record<string, any>>;

    /** Expose additional OIDC scopes this extension makes available */
    getScopes?(): string[];
}
