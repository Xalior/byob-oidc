import { Request, Application } from 'express';
import { Plugin, PluginMeta } from '../types.ts';

export interface OIDCAccount {
    accountId: string;
    claims(use: string, scope: string): Promise<Record<string, any>>;
}

/** How the login form should present the field that identifies a person. */
export interface LoginField {
    /** `email` makes the browser demand an address. `text` accepts anything. */
    type: 'email' | 'text';
    label: string;
    placeholder: string;
    autocomplete: string;
}

export interface ProviderPlugin extends Plugin {
    meta: PluginMeta & { type: 'provider' };

    /**
     * What the login form should ask for. A provider that identifies people by
     * something other than an email address says so here, or the browser will
     * refuse to submit a name that has no @ in it.
     * Omitted means an email address.
     */
    loginField?: LoginField;

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
     * Does this provider handle its own login UI externally?
     * If true, authenticate() is NOT called by core interaction routes.
     * Instead, core calls getExternalLoginUrl() and the provider handles
     * the full auth flow, redirecting back when done.
     */
    externalAuth?: boolean;
    getExternalLoginUrl?(returnTo: string): Promise<string>;
    handleExternalCallback?(req: Request): Promise<OIDCAccount | null>;
}
