import { createEnv } from "@t3-oss/env-core";
import { z} from "zod";
import dotenv from "dotenv";
import {page} from "../../data/page.js";
import jwks from '../../data/jkws.json' with { type: "json" };
import {Client, Provider, ResourceServer, OIDCContext, KoaContextWithOIDC} from 'oidc-provider';


// Load environment variables from .env file
dotenv.config();

export const env = createEnv({
    server: {
        PATREON_CLIENT_ID: z.string().optional(),
        PATREON_CLIENT_SECRET: z.string().optional(),
        HOSTNAME: z.string().nonempty("must not be empty"),
        MODE: z.string().default('dev'),
        DATABASE_URL: z.string().nonempty("MySQL database URL must not be empty"),
        CACHE_URL: z.string().nonempty("REDIS cache must not be empty"),
        CLIENT_FEATURES_REGISTRATION: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        DEBUG_ADAPTER: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
            DEBUG_ACCOUNT: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        PASSWORD_SALT: z.coerce.number().default(11),
        SMTP_HOST: z.string().nonempty("SMTP relay must not be empty"),
        SMTP_PORT: z.coerce.number().default(25),
        SMTP_SECURE: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "true"),
        SMTP_USER: z.string().optional(),
        SMTP_PASS: z.string().optional(),
    },

    runtimeEnv: process.env,
    // Optional: Error formatting
    onValidationError: (error) => {
        console.error("❌ Invalid environment variables:", error);
        throw new Error("Invalid environment variables");
    },
});


interface Token {
    resourceServer?: ResourceServer;
    isSenderConstrained?: () => boolean;
}
//
// interface Client {
//     clientId: string;
//     grantTypeAllowed: (type: string) => boolean;
//     applicationType?: string;
//     clientAuthMethod?: string;
// }
//
// interface OidcContext {
//     oidc: {
//         params: {
//             requested_expiry?: string;
//         };
//         result?: {
//             consent?: {
//                 grantId?: string;
//             };
//         };
//         client: Client;
//         session: {
//             accountId: string;
//             grantIdFor: (clientId: string) => string | undefined;
//             exp: number;
//         };
//         account?: any;
//         provider: {
//             Grant: {
//                 find: (id: string) => Promise<any>;
//             };
//         };
//         entities: {
//             RotatedRefreshToken?: {
//                 remainingTTL: number;
//             };
//         };
//     };
//     host?: string;
// }

export interface Config {
    patreon: {
        client_id: string | undefined;
        client_secret: string | undefined;
    };
    provider_url: string;
    hostname: string;
    mode: string;
    database_url: string;
    cache_url: string;
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
            user: string | undefined;
            pass: string | undefined;
        };
    };
    ttl: {
        AccessToken: (ctx: KoaContextWithOIDC, token: Token, client: Client) => number;
        AuthorizationCode: number;
        BackchannelAuthenticationRequest: (ctx: KoaContextWithOIDC, request: any, client: Client) => number;
        ClientCredentials: (ctx: KoaContextWithOIDC, token: Token, client: Client) => number;
        DeviceCode: number;
        Grant: number;
        IdToken: number;
        Interaction: number;
        RefreshToken: (ctx: KoaContextWithOIDC, token: Token, client: Client) => number;
        Session: number;
    };
    interactions: {
        url: (ctx: KoaContextWithOIDC, interaction: { uid: string }) => string;
    };
    issueRefreshToken: (ctx: KoaContextWithOIDC, client: Client, code: any) => Promise<boolean>;
    renderError: (ctx: KoaContextWithOIDC, out: any, error: { statusCode?: number }) => void;
    loadExistingGrant: (ctx: KoaContextWithOIDC) => Promise<any>;
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
            logoutSource: (ctx: KoaContextWithOIDC, form: string) => Promise<void>;
            postLogoutSuccessSource: (ctx: KoaContextWithOIDC) => Promise<void>;
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

export const config: Config = {
    provider_url: `https://${env.HOSTNAME}/`,
    hostname: `${env.HOSTNAME}`,
    mode: env.MODE,
    database_url: env.DATABASE_URL,
    cache_url: env.CACHE_URL,
    debug: {
        adapter: env.DEBUG_ADAPTER,
        account: env.DEBUG_ACCOUNT,
    },

    client_features: {
        registration: env.CLIENT_FEATURES_REGISTRATION,
    },

    password: {
        salt: env.PASSWORD_SALT,
    },

    smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE, // true for port 465, false for other ports
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    },
    // copied from defaults
    ttl: {
        AccessToken: function AccessTokenTTL(ctx, token, client) {
            return token.resourceServer?.accessTokenTTL || 60 * 60; // 1 hour in seconds
        },
        AuthorizationCode: 60 /* 1 minute in seconds */,
        BackchannelAuthenticationRequest: function BackchannelAuthenticationRequestTTL(ctx, request, client) {
            if (ctx?.oidc && ctx.oidc.params?.requested_expiry) {
                return Math.min(10 * 60, +ctx.oidc.params.requested_expiry); // 10 minutes in seconds or requested_expiry, whichever is shorter
            }

            return 10 * 60; // 10 minutes in seconds
        },
        ClientCredentials: function ClientCredentialsTTL(ctx, token, client) {
            return token.resourceServer?.accessTokenTTL || 10 * 60; // 10 minutes in seconds
        },
        DeviceCode: 600 /* 10 minutes in seconds */,
        Grant: 1209600 /* 14 days in seconds */,
        IdToken: 3600 /* 1 hour in seconds */,
        Interaction: 3600 /* 1 hour in seconds */,
        RefreshToken: function RefreshTokenTTL(ctx, token, client) {
            // console.log("Refresh Token TTL", ctx, token, client);
            if (ctx && ctx.oidc.entities.RotatedRefreshToken
                && client.applicationType === 'web'
                && client.clientAuthMethod === 'none'
                && !token.isSenderConstrained?.()) {
                // Non-Sender Constrained SPA RefreshTokens do not have infinite expiration through rotation
                return ctx.oidc.entities.RotatedRefreshToken.remainingTTL;
            }

            return 14 * 24 * 60 * 60; // 14 days in seconds
        },
        Session: 1209600 /* 14 days in seconds */
    },
    //
    // interactions: {
    //     url(ctx, interaction) {
    //         // console.log("Possible interaction hook: ", interaction);
    //         return `/interaction/${interaction.uid}`;
    //     },
    // },
    //
    // async issueRefreshToken(ctx, client, code) {
    //     return client.grantTypeAllowed('refresh_token');
    // },
    async renderError(ctx, out, error) {
        //
        // console.log("RENDER CONTEXT:", ctx);
        // console.log("OUTPUT:", out);
        let error_message = "Oops. Something went wrong!";

        if (error && error.statusCode === 404) {
            error_message = "404: Page Not Found!";
        } else {
            console.log("RENDER ERROR:", error);
        }

        page(ctx, error_message);
    },

    // Do not ask for a grants dialog confirmation - since we a closed circuit network, we grant what we ask for.
    async loadExistingGrant(ctx) {
        if(!ctx.oidc.client) return null;
        if(!ctx.oidc.session) return null;
        if(!ctx.oidc.result) return null;

        const grantId = ctx.oidc.result.consent?.grantId
            || ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId as string);

        if (grantId) {
            // console.log("Loading existing grant", ctx.oidc.client, ctx.oidc.session);
            // keep grant expiry aligned with session expiry
            // to prevent consent prompt being requested when grant expires
            const grant = await ctx.oidc.provider.Grant.find(grantId);
            if(!grant) return null;

            // this aligns the Grant ttl with that of the current session
            // if the same Grant is used for multiple sessions, or is set
            // to never expire, you probably do not want this in your code
            if (ctx.oidc.account && (grant.exp as number) < ctx.oidc.session.exp) {
                grant.exp = ctx.oidc.session.exp;

                await grant.save();
            }

            return grant;
        } else /*if (isFirstParty(ctx.oidc.client))*/ {
            // console.log("Creating new grant", ctx.oidc.client, ctx.oidc.session);
            /*

            There is an option here to pull a user's permitted scope list from the accounts database,
                and with this data deny based on either a grant request type, or CLIENT_ID...

             */
            const grant = new ctx.oidc.provider.Grant({
                clientId: ctx.oidc.client.clientId,
                accountId: ctx.oidc.session.accountId,
            });

            grant.addOIDCScope('openid email profile refresh_token');
            grant.addOIDCClaims(['display_name']);
            grant.addResourceScope('urn:example:resource-indicator', 'api:read api:write');
            await grant.save();
            return grant;
        }
    },

    cookies: {
        keys: ['some secret key', 'and also the old rotated away some time ago', 'and one more'],
    },
    claims: {
        email: ['email', 'verified', 'suspended', 'display_name'],
        // profile: ['email', 'display_name'],
    },
    features: {
        clientCredentials: {
            enabled: true
        },
        // existing features
        introspection: {
            enabled: true
        },
        devInteractions: {
            // defaults to true
            enabled: false
        },
        rpInitiatedLogout: {
            logoutSource: async (ctx, form) => {
                // @param ctx - koa request context
                // @param form - form source (id="op.logoutForm") to be embedded in the page and submitted by
                //   the End-User
                page(ctx, `<h1>Do you want to sign-out from the Single Sign-On (SSO) System at ${ctx.host} too?</h1>
                    ${form}
                    <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Yes, sign me out</button>
                    <button type="submit" form="op.logoutForm">No, stay signed in</button>`);
            },
            postLogoutSuccessSource: async (ctx) => {
                // @param ctx - koa request context
                const {
                    clientId, clientName,
                } = ctx.oidc.client || {}; // client is defined if the user chose to stay logged in with the authorization server
                const display = clientName || clientId;
                page(ctx, `<h1>Sign-out Success</h1>
                                <p>Your sign-out ${display ? `with ${display}` : ''} was successful.</p>`);
            }
        }
    },
    jwks: jwks,
    patreon: {
        client_id: env.PATREON_CLIENT_ID,
        client_secret: env.PATREON_CLIENT_SECRET
    },

    interactions: {
        url(ctx, interaction) {
            // console.log("Possible interaction hook: ", interaction);
            return `/interaction/${interaction.uid}`;
        },
    },

    async issueRefreshToken(ctx, client, code) {
        return client.grantTypeAllowed('refresh_token');
    },
};
