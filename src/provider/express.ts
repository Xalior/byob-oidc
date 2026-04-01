import { strict as assert } from 'node:assert';
import * as querystring from 'node:querystring';
import { inspect } from 'node:util';

import isEmpty from 'lodash/isEmpty.js';
import { urlencoded } from 'express';
import { Request, Response, NextFunction, Application } from 'express';

import { getProvider, getMFA } from '../plugins/registry.ts';
import { errors } from 'oidc-provider';
import { config } from '../lib/config.ts';

const body = urlencoded({ extended: false });

const keys = new Set();

const debug = (obj: any) => querystring.stringify(Object.entries(obj).reduce((acc: any, [key, value]) => {
    keys.add(key);
    if (isEmpty(value)) return acc;
    acc[key] = inspect(value, { depth: null });
    return acc;
}, {}), '<br/>', ': ', {
    encodeURIComponent(value: string) { return keys.has(value) ? `<strong>${value}</strong>` : value; },
});

const { SessionNotFound } = errors;

const setNoCache = (req: Request, res: Response, next: NextFunction) => {
    res.set('cache-control', 'no-store');
    next();
}

interface OIDCProvider {
    interactionDetails: (req: Request, res: Response) => Promise<any>;
    interactionFinished: (req: Request, res: Response, result: any, options: any) => Promise<void>;
    Client: {
        find: (clientId: string) => Promise<any>;
    };
    Grant: {
        find: (grantId: string) => Promise<any>;
    };
}

export default (app: Application, provider: OIDCProvider): void => {

    app.get('/interaction/:uid', setNoCache, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const {
                uid, prompt, params, session,
            } = await provider.interactionDetails(req, res);

            const client = await provider.Client.find(params.client_id);

            prompt.details = [ prompt.details.missingOIDCScope, prompt.details.missingOIDCClaims,
                prompt.details.missingResourceScopes, prompt.details.rar].filter(Boolean).length === 0;

            const missingOIDCScope = new Set(prompt.details.missingOIDCScope || []);
            missingOIDCScope.delete('openid');
            missingOIDCScope.delete('offline_access');

            const missingOIDCClaims = new Set(prompt.details.missingOIDCClaims || []);
            ['sub', 'sid', 'auth_time', 'acr', 'amr', 'iss'].forEach((claim) => missingOIDCClaims.delete(claim));

            const missingResourceScopes = prompt.details.missingResourceScopes || {};
            const eachMissingResourceScope = Object.entries(missingResourceScopes).map(([indicator, scopes]) => ({
                indicator,
                scopes,
            }));

            console.log("Login Form Session: ", req.session, new Date().toISOString());

            switch (prompt.name) {
                case 'login': {
                    req.session.__interaction_uid = uid;

                    return res.render('login', {
                        client,
                        uid,
                        details: prompt.details,
                        params,
                        title: 'Sign-in',
                        registration_enabled: config.client_features.registration,
                        session: session ? debug(session) : undefined,
                        dbg: {
                            params: debug(params),
                            prompt: debug(prompt),
                            res: debug(res),
                        },
                    });
                }

                case 'consent': {
                    throw(new Error(`Unexpected consent request`));
                }

                default:
                    return undefined;
            }
        } catch (err) {
            return next(err);
        }
    });

    app.post('/interaction/:uid/login', setNoCache, body, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const details = await provider.interactionDetails(req, res);
            assert.equal(details.prompt['name'], 'login');

            const providerPlugin = getProvider();

            // For external auth providers, redirect to external login
            if (providerPlugin.externalAuth && providerPlugin.getExternalLoginUrl) {
                const returnUrl = `${req.protocol}://${req.get('host')}/interaction/${req.params.uid}/callback`;
                const loginUrl = await providerPlugin.getExternalLoginUrl(returnUrl);
                return res.redirect(loginUrl);
            }

            const account = await providerPlugin.authenticate(req);

            if (!account) {
                return res.redirect(`/interaction/${details.jti}`);
            }

            // Store remember_me preference in session
            if (req.body.remember_me) {
                req.session.remember_me = true;
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            }

            // Delegate to MFA plugin
            // For now, use the first loaded MFA plugin. Future: let user choose.
            const mfa = getMFA();
            const needsChallenge = await mfa.requiresChallenge(account);

            if (needsChallenge) {
                // Store accountId in session so /mfa route can finish the interaction
                (req.session as any).__mfa_accountId = account.accountId;

                const challengeId = await mfa.issueChallenge(account, req);
                return res.render('mfa', {
                    uid: req.params.uid,
                    challengeId,
                });
            }

            // No MFA needed — finish interaction
            const result = {
                login: { accountId: account.accountId },
            };
            await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });

        } catch (err) {
            next(err);
        }
    });

    app.post('/interaction/:uid/mfa', setNoCache, body, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const details = await provider.interactionDetails(req, res);
            assert.equal(details.prompt['name'], 'login');

            // Use the first MFA plugin (same as login route)
            const mfa = getMFA();
            const challengeId = req.params.uid;

            const verified = await mfa.verifyChallenge(challengeId, req);

            if (!verified) {
                return res.render('mfa', {
                    uid: req.params.uid,
                });
            }

            // accountId was stored in express session during /login before MFA handoff
            const accountId = req.session && (req.session as any).__mfa_accountId;

            if (!accountId) {
                req.flash('error', 'Session expired. Please log in again.');
                return res.redirect(`/interaction/${details.jti}`);
            }

            delete (req.session as any).__mfa_accountId;

            const result = {
                login: { accountId },
            };

            await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
        } catch (err) {
            next(err);
        }
    });

    app.get('/interaction/:uid/abort', setNoCache, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = {
                error: 'access_denied',
                error_description: 'End-User aborted interaction',
            };
            await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
        } catch (err) {
            next(err);
        }
    });

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err instanceof SessionNotFound) {
            req.flash('error', 'Session expired - please log in again&hellip;');
            return res.redirect('/login');
        }
        next(err);
    });
};
