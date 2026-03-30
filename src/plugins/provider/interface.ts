import { Request, Application } from 'express';
import { Plugin, PluginMeta } from '../types.ts';

export interface OIDCAccount {
    accountId: string;
    claims(use: string, scope: string): Promise<Record<string, any>>;
}

export interface ProviderPlugin extends Plugin {
    meta: PluginMeta & { type: 'provider' };

    /**
     * Verify credentials from login form (req.body.login, req.body.password).
     * Returns account on success, null on failure.
     * Provider sets flash messages on req for error feedback.
     */
    authenticate(req: Request): Promise<OIDCAccount | null>;

    /**
     * Look up an account by its unique account_id.
     * Called by oidc-provider during token issuance and userinfo.
     */
    findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null>;

    /**
     * Return OIDC claims for a given account.
     */
    getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>>;

    /**
     * Register provider-specific Express routes (registration, profile, password reset, etc.).
     * A headless provider (CSV, passwd) does not implement this.
     */
    getRoutes?(app: Application): void;

    /**
     * Look up an account by email address (without verifying credentials).
     * Returns the account if found and eligible, null otherwise.
     * Used by extensions that need to check if a user exists (e.g. FlashBack).
     */
    findByEmail?(email: string): Promise<OIDCAccount | null>;

    /**
     * Programmatically create a new user account.
     * Returns the created account on success, null on failure.
     * Used by extensions that handle registration outside the normal flow.
     */
    createAccount?(data: { email: string; displayName: string; password: string; registeredFromClientId?: string }): Promise<OIDCAccount | null>;

    /**
     * Does this provider handle its own login UI externally?
     * If true, authenticate() is NOT called by core interaction routes.
     * Instead, core calls getExternalLoginUrl() and the provider handles
     * the full auth flow, redirecting back when done.
     */
    externalAuth?: boolean;
    getExternalLoginUrl?(returnTo: string): Promise<string>;
    handleExternalCallback?(req: Request): Promise<OIDCAccount | null>;
}
