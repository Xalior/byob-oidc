import {Context} from "express";
import { createEnv } from "@t3-oss/env-core";
import { z} from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export const env = createEnv({
    patreon: {
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
    };
    provider_url: string;
    slug: string;
    mode: z.string().default('prod'),
    database_url: string;
    cache_url: string;
    force_https: boolean;
    client_features: {
        registration: boolean | undefined;
    },
    debug: {
        adapter: boolean;
        account: boolean;
    };
    password: {
        salt: number;
    };
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass: string;
        };
    };
    clients: Array<{
        client_id?: string;
        client_secret?: string;
        grant_requirements?: string[];
        grant_types?: string[];
        redirect_uris?: string[];
    }>;
    ttl: {
        AccessToken: (ctx: OidcContext, token: Token, client: Client) => number;
        AuthorizationCode: number;
        BackchannelAuthenticationRequest: (ctx: OidcContext, request: any, client: Client) => number;
        ClientCredentials: (ctx: OidcContext, token: Token, client: Client) => number;
        DeviceCode: number;
        Grant: number;
        IdToken: number;
        Interaction: number;
        RefreshToken: (ctx: OidcContext, token: Token, client: Client) => number;
        Session: number;
    };
    interactions: {
        url: (ctx: OidcContext, interaction: { uid: string }) => string;
    };
    issueRefreshToken: (ctx: OidcContext, client: Client, code: any) => Promise<boolean>;
    renderError: (ctx: Context, out: any, error: { statusCode?: number }) => void;
    loadExistingGrant: (ctx: OidcContext) => Promise<any>;
    cookies: {
        keys: string[];
    };
    claims: {
        [key: string]: string[];
    };
    features: {
        clientCredentials: {
            enabled: boolean;
        };
        introspection: {
            enabled: boolean;
        };
        devInteractions: {
            enabled: boolean;
        };
        rpInitiatedLogout: {
            logoutSource: (ctx: Context, form: string) => Promise<void>;
            postLogoutSuccessSource: (ctx: OidcContext) => Promise<void>;
        };
    };
    jwks: {
        keys: Array<{
            d?: string;
            dp?: string;
            dq?: string;
            e?: string;
            kty: string;
            n?: string;
            p?: string;
            q?: string;
            qi?: string;
            use: string;
            crv?: string;
            x?: string;
            y?: string;
        }>;
    };
    findAccount?: (ctx: any, id: string, token?: any) => Promise<any>;
}


interface ResourceServer {
    accessTokenTTL?: number;
}

interface Token {
    resourceServer?: ResourceServer;
    isSenderConstrained?: () => boolean;
}

interface Client {
    clientId: string;
    grantTypeAllowed: (type: string) => boolean;
    applicationType?: string;
    clientAuthMethod?: string;
}

interface OidcContext {
    oidc: {
        params: {
            requested_expiry?: string;
        };
        result?: {
            consent?: {
                grantId?: string;
            };
        };
        client: Client;
        session: {
            accountId: string;
            grantIdFor: (clientId: string) => string | undefined;
            exp: number;
        };
        account?: any;
        provider: {
            Grant: {
                find: (id: string) => Promise<any>;
            };
        };
        entities: {
            RotatedRefreshToken?: {
                remainingTTL: number;
            };
        };
    };
    host?: string;
}

export interface Config {
    patreon: {
        client_id: string;
        client_secret: string;
    };
    provider_url: string;
    slug: string;
    mode: string;
    database_url: string;
    cache_url: string;
    force_https: boolean;
    client_features: {
        registration: boolean | undefined;
    },
    debug: {
        adapter: boolean;
        account: boolean;
    };
    password: {
        salt: number;
    };
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass: string;
        };
    };
    clients: Array<{
        client_id?: string;
        client_secret?: string;
        grant_requirements?: string[];
        grant_types?: string[];
        redirect_uris?: string[];
    }>;
    ttl: {
        AccessToken: (ctx: OidcContext, token: Token, client: Client) => number;
        AuthorizationCode: number;
        BackchannelAuthenticationRequest: (ctx: OidcContext, request: any, client: Client) => number;
        ClientCredentials: (ctx: OidcContext, token: Token, client: Client) => number;
        DeviceCode: number;
        Grant: number;
        IdToken: number;
        Interaction: number;
        RefreshToken: (ctx: OidcContext, token: Token, client: Client) => number;
        Session: number;
    };
    interactions: {
        url: (ctx: OidcContext, interaction: { uid: string }) => string;
    };
    issueRefreshToken: (ctx: OidcContext, client: Client, code: any) => Promise<boolean>;
    renderError: (ctx: Context, out: any, error: { statusCode?: number }) => void;
    loadExistingGrant: (ctx: OidcContext) => Promise<any>;
    cookies: {
        keys: string[];
    };
    claims: {
        [key: string]: string[];
    };
    features: {
        clientCredentials: {
            enabled: boolean;
        };
        introspection: {
            enabled: boolean;
        };
        devInteractions: {
            enabled: boolean;
        };
        rpInitiatedLogout: {
            logoutSource: (ctx: Context, form: string) => Promise<void>;
            postLogoutSuccessSource: (ctx: OidcContext) => Promise<void>;
        };
    };
    jwks: {
        keys: Array<{
            d?: string;
            dp?: string;
            dq?: string;
            e?: string;
            kty: string;
            n?: string;
            p?: string;
            q?: string;
            qi?: string;
            use: string;
            crv?: string;
            x?: string;
            y?: string;
        }>;
    };
    findAccount?: (ctx: any, id: string, token?: any) => Promise<any>;
}
