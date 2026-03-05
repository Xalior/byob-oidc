import jwks from '../../data/jkws.json' with { type: "json" };
import type { AppConfig } from './config.ts';

/**
 * Build the oidc-provider configuration object.
 * Isolates all oidc-provider-specific types and config here so the rest of
 * the app doesn't depend on oidc-provider's API surface.
 */
export function buildOIDCConfig(appConfig: AppConfig) {
    return {
        ttl: {
            AccessToken: function AccessTokenTTL(_ctx: any, token: any, _client: any) {
                return token.resourceServer?.accessTokenTTL || 60 * 60;
            },
            AuthorizationCode: 60,
            BackchannelAuthenticationRequest: function BackchannelAuthenticationRequestTTL(ctx: any, _request: any, _client: any) {
                if (ctx?.oidc && ctx.oidc.params?.requested_expiry) {
                    return Math.min(10 * 60, +ctx.oidc.params.requested_expiry);
                }
                return 10 * 60;
            },
            ClientCredentials: function ClientCredentialsTTL(_ctx: any, token: any, _client: any) {
                return token.resourceServer?.accessTokenTTL || 10 * 60;
            },
            DeviceCode: 600,
            Grant: 1209600,
            IdToken: 3600,
            Interaction: 3600,
            RefreshToken: function RefreshTokenTTL(ctx: any, token: any, client: any) {
                if (ctx && ctx.oidc.entities.RotatedRefreshToken
                    && client.applicationType === 'web'
                    && client.clientAuthMethod === 'none'
                    && !token.isSenderConstrained?.()) {
                    return ctx.oidc.entities.RotatedRefreshToken.remainingTTL;
                }
                return 14 * 24 * 60 * 60;
            },
            Session: 1209600,
        },

        async renderError(ctx: any, _out: any, error: any) {
            const { getTheme } = await import('../plugins/registry.ts');
            let error_message = "Oops. Something went wrong!";
            if (error && error.statusCode === 404) {
                error_message = "404: Page Not Found!";
            } else {
                console.log("RENDER ERROR:", error);
            }
            ctx.body = getTheme().page(error_message);
        },

        async loadExistingGrant(ctx: any) {
            if (!ctx.oidc.client) return null;
            if (!ctx.oidc.session) return null;

            const grantId = (ctx.oidc.result?.consent?.grantId
                || ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId as string)) as string;

            if (ctx.oidc.result && grantId) {
                if (appConfig.debug.account) console.debug("debug.account: loadExistingGrant", ctx);
                const grant = await ctx.oidc.provider.Grant.find(grantId);
                if (!grant) return null;

                if (ctx.oidc.account && (grant.exp as number) < ctx.oidc.session.exp) {
                    grant.exp = ctx.oidc.session.exp;
                    await grant.save();
                }

                return grant;
            } else {
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
        },

        features: {
            clientCredentials: { enabled: true },
            introspection: { enabled: true },
            devInteractions: { enabled: false },
            rpInitiatedLogout: {
                logoutSource: async (ctx: any, form: string) => {
                    const { getTheme } = await import('../plugins/registry.ts');
                    const themeApi = getTheme();
                    if (themeApi.logout) {
                        ctx.body = themeApi.logout(form, ctx.host);
                    } else {
                        ctx.body = themeApi.page(`<h1>Do you want to sign-out from the Single Sign-On (SSO) System at ${ctx.host} too?</h1>
                            ${form}
                            <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Yes, sign me out</button>
                            <button type="submit" form="op.logoutForm">No, stay signed in</button>`);
                    }
                },
                postLogoutSuccessSource: async (ctx: any) => {
                    const { getTheme } = await import('../plugins/registry.ts');
                    const { clientId, clientName } = ctx.oidc.client || {};
                    const display = clientName || clientId;
                    const themeApi = getTheme();
                    if (themeApi.loggedout) {
                        ctx.body = themeApi.loggedout(display);
                    } else {
                        ctx.body = themeApi.page(`<h1>Sign-out Success</h1>
                            <p>Your sign-out ${display ? `with ${display}` : ''} was successful.</p>`);
                    }
                },
            },
        },

        jwks,

        interactions: {
            url(_ctx: any, interaction: { uid: string }) {
                return `/interaction/${interaction.uid}`;
            },
        },

        async issueRefreshToken(_ctx: any, client: any, _code: any) {
            return client.grantTypeAllowed('refresh_token');
        },

        // findAccount is set at boot time by server.ts from the provider plugin
        findAccount: undefined as any,
    };
}
