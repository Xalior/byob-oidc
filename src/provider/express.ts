/* eslint-disable no-console, camelcase, no-unused-vars */
import { strict as assert } from 'node:assert';
import * as querystring from 'node:querystring';
import { inspect } from 'node:util';

import isEmpty from 'lodash/isEmpty.js';
import { urlencoded } from 'express';
import { Request, Response, NextFunction, Application } from 'express';

import DatabaseAdapter from "../database_adapter.ts";

import { Account } from '../models/account.ts';
import { errors } from 'oidc-provider';
import { sendLoginPinEmail } from "../lib/email.ts";
import { check, matchedData } from "express-validator";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { eq } from "drizzle-orm";

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

const mfaCode = new DatabaseAdapter("MFACode");

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
            const filteredMissingOIDCScope = Array.from(missingOIDCScope);

            const missingOIDCClaims = new Set(prompt.details.missingOIDCClaims || []);
            ['sub', 'sid', 'auth_time', 'acr', 'amr', 'iss'].forEach((claim) => missingOIDCClaims.delete(claim));
            const filteredMissingOIDCClaims = Array.from(missingOIDCClaims);

            const missingResourceScopes = prompt.details.missingResourceScopes || {};
            const eachMissingResourceScope = Object.entries(missingResourceScopes).map(([indicator, scopes]) => ({
                indicator,
                scopes,
            }));

            console.log("Login Form Session: ", req.session);

            switch (prompt.name) {
                case 'login': {
                    return res.render('login', {
                        client,
                        uid,
                        details: prompt.details,
                        params,
                        title: 'Sign-in',
                        session: session ? debug(session) : undefined,
                        dbg: {
                            params: debug(params),
                            prompt: debug(prompt),
                            res: debug(res),
                        },
                    });
                }

                // We are a "closed circuit" network, with locked down clients and providers - so consent is implied - we should never end up here...
                case 'consent': {
                    // 'throw'ing will generate a log, and give a 500 error - best we can do in this circumstance
                    throw(new Error(`Unexpected consent request (filteredMissingOIDCScope:${filteredMissingOIDCScope} eachMissingResourceScope:${eachMissingResourceScope} filteredMissingOIDCClaims:${filteredMissingOIDCClaims})`));
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

            const account = await Account.findByLogin(req);

            if(!account) {
                return res.redirect(`/interaction/${details.jti}`);
            }

            // Store remember_me preference in session
            if (req.body.remember_me) {
                req.session.remember_me = true;
                // Set a longer cookie expiration when "remember me" is checked
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            }

            const mfa_pin = ('000000'+Math.floor(Math.random() * 1000000)).slice(-6);
            const request_time = new Date().toJSON();
            await mfaCode.upsert(req.params.uid, {
                pin: mfa_pin,
                accountId: account.accountId,
                requestTime: request_time
            },15*60);

            await sendLoginPinEmail(req, req.body.login, mfa_pin, request_time);

            return res.render('mfa', {
                'uid': req.params.uid,
            });

        } catch (err) {
            next(err);
        }
    });

    app.post('/interaction/:uid/mfa', setNoCache, body,
        // Validation
        check('mfa').trim().notEmpty().isNumeric().isLength({
            min: 6,
            max: 6,
        }).withMessage('Invalid MFA PIN.'),

        // Actual Page Handler
        async (req: Request, res: Response, next: NextFunction) => {
        try {
            const details = await provider.interactionDetails(req, res);

            assert.equal(details.prompt['name'], 'login');

            const mfa_form = matchedData(req, { includeOptionals: true });

            const mfa_code = await mfaCode.find(req.params.uid);

            if(!mfa_code) {
                req.flash('error', 'Unexpected MFA Pin lookup request!');

                return res.redirect(`/interaction/${details.jti}`);
            }

            const account = await Account.findAccount(null, mfa_code?.accountId);

            if(!account) {
                req.flash('error', 'Unexpected account request!');

                return res.redirect(`/interaction/${details.jti}`);
            }

            console.log("Form, MFA & Account: ", mfa_form, mfa_code, account);

            // User Locked
            if(account.profile.user.login_attempts>2) {
                req.flash('error', 'Account Locked.<br> <a href="/lost_password">Reset your password</a> to continue.');

                return res.redirect(`/interaction/${details.jti}`);
            }

            if(mfa_form.mfa !== mfa_code.pin) {
                await db.update(users).set({
                    login_attempts: account.profile.user.login_attempts+1,
                }).where(eq(users.id, account.profile.user.id));

                req.flash('error', 'Invalid Passcode!');

                return res.render('mfa', {
                    'uid': req.params.uid,
                });

            }

            mfaCode.destroy(account.accountId);

            const result = {
                login: {
                    accountId: account.accountId,
                },
            };

            // Successful login == reset login_attempts
            if(account.profile.user.login_attempts>0) {
                await db.update(users).set({
                    login_attempts: account.profile.user.login_attempts + 1,
                }).where(eq(users.id, account.profile.user.id));
            }

            console.log("MFA Complete: ", req.session);
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