import {Context} from "express";
import { createEnv } from "@t3-oss/env-core";
import { z} from "zod";
import dotenv from "dotenv";
import {page} from "../../data/page.js";

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
          .transform((s) => s === "false"),
            DEBUG_ACCOUNT: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "false"),
        PASSWORD_SALT: z.coerce.number().default(11),
        SMTP_HOST: z.string().nonempty("SMTP relay must not be empty"),
        SMTP_PORT: z.coerce.number().default(25),
        SMTP_SECURE: z.string()
          .refine((s) => s === "true" || s === "false")
          .transform((s) => s === "false"),
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
    force_https: boolean;
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

    force_https: true,

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


    clients: [
        // {
        //     client_id: 'CLIENT_ID',
        //     client_secret: 'CLIENT_SECRET',
        //     grant_requirements: ['ADMIN'],
        //     grant_types: ['refresh_token', 'authorization_code'],
        //     redirect_uris: ['https://psteniusubi.github.io/oidc-tester/authorization-code-flow.html'],
        // }
    ],

    ttl: {
        AccessToken: function AccessTokenTTL(ctx, token, client) {
            return token.resourceServer?.accessTokenTTL || 60 * 60; // 1 hour in seconds
        },
        AuthorizationCode: 60 /* 1 minute in seconds */,
        BackchannelAuthenticationRequest: function BackchannelAuthenticationRequestTTL(ctx, request, client) {
            if (ctx?.oidc && ctx.oidc.params.requested_expiry) {
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
            if (
                ctx && ctx.oidc.entities.RotatedRefreshToken
                && client.applicationType === 'web'
                && client.clientAuthMethod === 'none'
                && !token.isSenderConstrained?.()
            ) {
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

        if(error.statusCode === 404) {
            error_message = "404: Page Not Found!";
        } else {
            console.log("RENDER ERROR:", error);
        }

        page(ctx, error_message);
    },

    // Do not ask for a grants dialog confirmation - since we a closed circuit network, we grant what we ask for.
    async loadExistingGrant(ctx) {
        const grantId = ctx.oidc.result?.consent?.grantId
            || ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId);

        if (grantId) {
            // console.log("Loading existing grant", ctx.oidc.client, ctx.oidc.session);
            // keep grant expiry aligned with session expiry
            // to prevent consent prompt being requested when grant expires
            const grant = await ctx.oidc.provider.Grant.find(grantId);

            // this aligns the Grant ttl with that of the current session
            // if the same Grant is used for multiple sessions, or is set
            // to never expire, you probably do not want this in your code
            if (ctx.oidc.account && grant.exp < ctx.oidc.session.exp) {
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
                    clientId, clientName, clientUri, initiateLoginUri, logoUri, policyUri, tosUri,
                } = ctx.oidc.client || {}; // client is defined if the user chose to stay logged in with the authorization server
                const display = clientName || clientId;
                page(ctx, `<h1>Sign-out Success</h1>
                                <p>Your sign-out ${display ? `with ${display}` : ''} was successful.</p>`);
            }
        }
    },
    jwks: {
        keys: [
            {
                d: 'VEZOsY07JTFzGTqv6cC2Y32vsfChind2I_TTuvV225_-0zrSej3XLRg8iE_u0-3GSgiGi4WImmTwmEgLo4Qp3uEcxCYbt4NMJC7fwT2i3dfRZjtZ4yJwFl0SIj8TgfQ8ptwZbFZUlcHGXZIr4nL8GXyQT0CK8wy4COfmymHrrUoyfZA154ql_OsoiupSUCRcKVvZj2JHL2KILsq_sh_l7g2dqAN8D7jYfJ58MkqlknBMa2-zi5I0-1JUOwztVNml_zGrp27UbEU60RqV3GHjoqwI6m01U7K0a8Q_SQAKYGqgepbAYOA-P4_TLl5KC4-WWBZu_rVfwgSENwWNEhw8oQ',
                dp: 'E1Y-SN4bQqX7kP-bNgZ_gEv-pixJ5F_EGocHKfS56jtzRqQdTurrk4jIVpI-ZITA88lWAHxjD-OaoJUh9Jupd_lwD5Si80PyVxOMI2xaGQiF0lbKJfD38Sh8frRpgelZVaK_gm834B6SLfxKdNsP04DsJqGKktODF_fZeaGFPH0',
                dq: 'F90JPxevQYOlAgEH0TUt1-3_hyxY6cfPRU2HQBaahyWrtCWpaOzenKZnvGFZdg-BuLVKjCchq3G_70OLE-XDP_ol0UTJmDTT-WyuJQdEMpt_WFF9yJGoeIu8yohfeLatU-67ukjghJ0s9CBzNE_LrGEV6Cup3FXywpSYZAV3iqc',
                e: 'AQAB',
                kty: 'RSA',
                n: 'xwQ72P9z9OYshiQ-ntDYaPnnfwG6u9JAdLMZ5o0dmjlcyrvwQRdoFIKPnO65Q8mh6F_LDSxjxa2Yzo_wdjhbPZLjfUJXgCzm54cClXzT5twzo7lzoAfaJlkTsoZc2HFWqmcri0BuzmTFLZx2Q7wYBm0pXHmQKF0V-C1O6NWfd4mfBhbM-I1tHYSpAMgarSm22WDMDx-WWI7TEzy2QhaBVaENW9BKaKkJklocAZCxk18WhR0fckIGiWiSM5FcU1PY2jfGsTmX505Ub7P5Dz75Ygqrutd5tFrcqyPAtPTFDk8X1InxkkUwpP3nFU5o50DGhwQolGYKPGtQ-ZtmbOfcWQ',
                p: '5wC6nY6Ev5FqcLPCqn9fC6R9KUuBej6NaAVOKW7GXiOJAq2WrileGKfMc9kIny20zW3uWkRLm-O-3Yzze1zFpxmqvsvCxZ5ERVZ6leiNXSu3tez71ZZwp0O9gys4knjrI-9w46l_vFuRtjL6XEeFfHEZFaNJpz-lcnb3w0okrbM',
                q: '3I1qeEDslZFB8iNfpKAdWtz_Wzm6-jayT_V6aIvhvMj5mnU-Xpj75zLPQSGa9wunMlOoZW9w1wDO1FVuDhwzeOJaTm-Ds0MezeC4U6nVGyyDHb4CUA3ml2tzt4yLrqGYMT7XbADSvuWYADHw79OFjEi4T3s3tJymhaBvy1ulv8M',
                qi: 'wSbXte9PcPtr788e713KHQ4waE26CzoXx-JNOgN0iqJMN6C4_XJEX-cSvCZDf4rh7xpXN6SGLVd5ibIyDJi7bbi5EQ5AXjazPbLBjRthcGXsIuZ3AtQyR0CEWNSdM7EyM5TRdyZQ9kftfz9nI03guW3iKKASETqX2vh0Z8XRjyU',
                use: 'sig',
            }, {
                crv: 'P-256',
                d: 'K9xfPv773dZR22TVUB80xouzdF7qCg5cWjPjkHyv7Ws',
                kty: 'EC',
                use: 'sig',
                x: 'FWZ9rSkLt6Dx9E3pxLybhdM6xgR5obGsj5_pqmnz5J4',
                y: '_n8G69C-A2Xl4xUW2lF0i8ZGZnk_KPYrhv4GbTGu5G4',
            },
        ],
    }
};
