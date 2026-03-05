import * as path from 'node:path';
import * as url from 'node:url';
import { existsSync } from 'node:fs';
import cors from 'cors';
import express, { Request, Response, NextFunction, Application } from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import helmet from 'helmet';
import { dirname } from 'desm';
import mustacheExpress from 'mustache-express';
import Provider from 'oidc-provider';
import * as log from './lib/log.js';
import provider_routes from './provider/express.js';
import client_routes from './controller/routes.js';
import morgan from 'morgan';
import csrf from "@dr.pogodin/csurf";

import { config } from './lib/config.js';
import { buildOIDCConfig } from './lib/oidc-config.js';
import { initializePlugins, getTheme, getSession, getProvider, getExtensions } from './plugins/registry.js';
import { Client } from './models/clients.js';

import * as openidClient from 'openid-client';
import passport from 'passport';
import { Strategy } from 'openid-client/passport';
import type { User as AccountUser } from './plugins-available/providers/simple-sql/account.js';
import * as http from "node:http";

// Extend Express Request type to include user and flash
declare global {
  namespace Express {
    interface Request {
        // @ts-ignore
      user?: AccountUser;
        // @ts-ignore
      logout: (done: (err: any) => void) => void;
      csrfToken: () => string;
    }
    interface Response {
      locals: {
        csrfToken?: string;
        [key: string]: any;
      };
    }
  }
}

declare module 'express-session' {
    interface SessionData {
        destination_path: string;
        remember_me: boolean;
        __mfa_accountId?: string;
    }
}

const __dirname = dirname(import.meta.url);

let server: http.Server;
let issuer: openidClient.Configuration;

try {
    // ── 1. Initialize all plugins ──────────────────────────────────────
    const pluginConfig = {
        hostname: config.hostname,
        site_name: config.site_name,
        mode: config.mode,
        provider_url: config.provider_url,
        smtp: config.smtp,
        debug: config.debug,
    };

    await initializePlugins({
        provider: config.provider,
        session: config.session,
        theme: config.theme,
        mfa: config.mfa,
        extensions: config.extensions,
    }, pluginConfig);

    // ── 2. Wire client finder into session adapter ─────────────────────
    const sessionPlugin = getSession();
    sessionPlugin.setClientFinder(async (clientId: string) => {
        return Client.findByClientId(clientId);
    });

    // ── 3. Build OIDC config ───────────────────────────────────────────
    const oidcConfig = buildOIDCConfig(config);
    const providerPlugin = getProvider();
    oidcConfig.findAccount = providerPlugin.findAccount.bind(providerPlugin);

    // ── 4. Create Express app ──────────────────────────────────────────
    const app: Application = express();

    // Logger
    app.use(morgan('combined', { stream: log.logstream }));

    // Session
    app.use(session({
        secret: config.session_secret,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: true },
    }));

    // Body parsing for app routes (oidc-provider has its own)
    app.use(
        ['/register', '/profile', '/lost_password', '/reset_password', '/reconfirm', '/interaction'],
        express.urlencoded({ extended: true })
    );

    // CSRF protection
    const csrfProtection = csrf({
        cookie: false,
        ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/token') ||
            req.path.startsWith('/session/end/confirm')
        ) {
            next();
        } else {
            csrfProtection(req, res, next);
        }
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
        if (!req.path.startsWith('/token')
            && !req.path.startsWith('/session/end/confirm')
        ) {
            res.locals.csrfToken = req.csrfToken();
        }
        next();
    });

    app.use(flash());
    app.use(cors());

    // ── 5. Theme static assets ─────────────────────────────────────────
    const theme = getTheme();
    const assetsDir = theme.assetsDir();
    if (assetsDir) {
        app.use('/theme', express.static(assetsDir));
    }

    // Helmet security
    const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
    delete directives['form-action'];
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives,
        },
    }));

    app.use(passport.authenticate('session'));

    // ── 6. Template engine ─────────────────────────────────────────────
    const contentDir = path.join(__dirname, '../content');
    app.engine('mustache', mustacheExpress(contentDir));
    app.set('view engine', 'mustache');

    // Use theme-specific layouts if they exist, otherwise fall back to default views
    const themeLayoutsDir = theme.layoutsDir();
    const defaultViewsDir = path.join(__dirname, 'views');
    const viewsDir = themeLayoutsDir && existsSync(themeLayoutsDir) ? themeLayoutsDir : defaultViewsDir;
    app.set('views', viewsDir);

    // ── 7. Render locals injection ─────────────────────────────────────
    const hide_headers: string[] = ['login', 'mfa', 'register'];

    app.use((req: Request, res: Response, next: NextFunction) => {
        const orig = res.render;

        res.render = async (view: string, locals?: Record<string, any>) => {
            locals = locals || {};

            if (req.user) {
                const account = await providerPlugin.findAccount(req, (req.user as any).sub);
                if (account) {
                    const claims = await account.claims('id_token', 'email');
                    req.user = claims as any;
                }
            }

            const renderLocals = {
                ...locals,
                errors: req.flash('error'),
                infos: req.flash('info'),
                warnings: req.flash('warning'),
                successes: req.flash('success'),
                user: req.user,
                csrfToken: res.locals.csrfToken,
                site_name: config.site_name,
                hide_header: hide_headers.includes(view)
            };

            app.render(view, renderLocals, (err: Error | null, html?: string) => {
                if (err) throw err;
                if (!html) throw new Error('No HTML rendered');
                orig.call(res, '_layout', {
                    ...renderLocals,
                    // @ts-ignore
                    body: html,
                });
            });
        };

        next();
    });

    // ── 8. Routes ──────────────────────────────────────────────────────
    const provider_url = new URL(config.provider_url);

    // Core + provider + extension routes
    client_routes(app);

    // Passport SSO login/callback/logout
    app.get('/login',
        passport.authenticate(provider_url.host, {
            failureRedirect: '/login',
            failureFlash: true,
            keepSessionInfo: true
        })
    );

    app.get('/callback',
        passport.authenticate(provider_url.host, {
            failureRedirect: '/login',
            failureFlash: true,
            keepSessionInfo: true
        }),
        function (req: Request, res: Response) {
            res.redirect('/');
        }
    );

    app.get('/logout', (req: Request, res: Response) => {
        req.logout(() => {
            res.redirect(
                openidClient.buildEndSessionUrl(issuer, {
                    post_logout_redirect_uri: `${req.protocol}://${req.get('host')}`,
                }).href,
            );
        });
    });

    passport.serializeUser((user: any, cb: (err: any, user: any) => void) => {
        cb(null, user);
    });

    passport.deserializeUser((user: any, cb: (err: any, user: any) => void) => {
        return cb(null, user);
    });

    // ── 9. OIDC Provider ───────────────────────────────────────────────
    const adapter = sessionPlugin.getAdapterConstructor();

    // Strip app-only keys that would confuse oidc-provider
    const oidcProvider = new Provider(config.provider_url, { adapter, ...oidcConfig });

    app.enable('trust proxy');
    oidcProvider.proxy = true;

    oidcProvider.addListener('server_error', (ctx: any, error: any) => {
        console.log(ctx, error);
        console.error(JSON.stringify(error, null, 2));
    });

    // HTTPS redirect
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.secure) {
            next();
        } else if (['GET', 'HEAD'].includes(req.method)) {
            res.redirect(url.format({
                protocol: 'https',
                host: req.get('host'),
                pathname: req.originalUrl,
            }));
        } else {
            res.status(400).json({
                error: 'invalid_request',
                error_description: 'Please use HTTPS for secure communication.',
            });
        }
    });

    // Interaction routes (delegates to provider + MFA plugins)
    provider_routes(app, oidcProvider);

    app.use(oidcProvider.callback());

    // ── 10. Start server ───────────────────────────────────────────────
    server = app.listen(config.port, () => {
        console.info(`Application is listening on port ${config.port}`);
        console.info(`Check /.well-known/openid-configuration for details.`);
    });

    // ── 11. Self-discovery + Passport strategy ─────────────────────────
    console.info("Beginning period of self discovery: ", config.provider_url);

    const maxRetries = 30;
    const retryInterval = 1000;
    let attempts = 0;
    let discoveredIssuer: openidClient.Configuration | undefined;

    while (attempts < maxRetries) {
        try {
            discoveredIssuer = await openidClient.discovery(
                new URL(config.provider_url),
                config.client_id,
                config.client_secret,
            );
            break;
        } catch (err: any) {
            attempts++;
            if (attempts >= maxRetries) {
                console.error(`Failed to discover issuer after ${maxRetries} attempts.`);
                throw err;
            }
            console.log(`Discovery attempt ${attempts} failed, retrying in ${retryInterval}ms...`);
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
    }

    if (!discoveredIssuer) {
        throw new Error("Discovery failed: issuer is undefined");
    }

    issuer = discoveredIssuer;
    console.log('Discovered issuer:', issuer.serverMetadata());

    passport.use(new Strategy({
        'config': issuer,
        'scope': 'openid email',
        'callbackURL': `${config.provider_url}callback`
    }, async (tokens: any, verified: (err: Error | null, user: any) => void) => {
            const this_claim = tokens.claims();
            const me = await openidClient.fetchUserInfo(issuer, tokens.access_token, this_claim.sub);
            console.log("openidClient.fetchUserInfo: ", me);
            verified(null, this_claim);
        }
    ));

    // ── 12. Error handling (must be last) ──────────────────────────────
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err.code === 'EBADCSRFTOKEN') {
            console.error(`ERROR: CSRF token validation failed - IP:${req.ip} - ${req.method} ${req.originalUrl} - ${req.body ? JSON.stringify(req.body) : ''}`);
            return res.status(403).render('error', {
                message: 'Security validation failed. Please try again.'
            });
        }

        console.error(err);
        res.status(500).render('error', {});
    });
} catch (err) {
    // @ts-ignore
    if (server?.listening) server.close();
    console.error('Error occurred:', err);
    process.exitCode = 1;
}
