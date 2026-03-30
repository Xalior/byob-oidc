/**
 * FlashBack Retro-Auth Extension Plugin
 *
 * Passwordless login flow for HTTP-only clients. An HTTP client initiates a
 * challenge via POST /flashback/init. The user receives an email with an HTTPS
 * approval (or registration) link. Once approved on a desktop browser, the
 * plugin POSTs a signed callback to the FlashBack server to activate the session.
 *
 * No passwords ever traverse plain HTTP.
 *
 * @see docs/plans/flashback-extension.md for the full flow description.
 */

import { ExtensionPlugin } from '../../../plugins/extension/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { getProvider, getSession } from '../../../plugins/registry.ts';
import { Client } from '../../../models/clients.ts';
import { Application, Request, Response, NextFunction } from 'express';
import { createHmac, randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────

/** Shape of a pending challenge stored in the session cache. */
interface FlashbackChallenge {
    /** The FlashBack client's session ID */
    sessionId: string;
    /** User's email address */
    email: string;
    /** FlashBack callback URL base (e.g. https://flashback.page) */
    callbackUrl: string;
    /** Whether a verified account exists for this email */
    userExists: boolean;
    /** Current challenge status */
    status: 'pending' | 'approved' | 'denied';
    /** Unix timestamp when the challenge was created */
    createdAt: number;
    /** The OIDC client_id that initiated this challenge (for registration-origin tracking) */
    initiatingClientId: string;
}

/** Payload sent to FlashBack via signed callback on approval. */
interface ApprovalCallbackPayload {
    userId: string;
    email: string;
    sessionId: string;
    action: 'approve';
    timestamp: number;
}

/** Payload sent to FlashBack via signed callback on denial. */
interface DenialCallbackPayload {
    sessionId: string;
    action: 'deny';
    timestamp: number;
}

/** Rate-limit entry: timestamps of recent requests per email. */
interface RateLimitEntry {
    timestamps: number[];
}

// ── Configuration ─────────────────────────────────────────────────────────

/** HMAC shared secret for signing callbacks (required) */
let sharedSecret: string;
/** Default callback URL (can be overridden per-request) */
let defaultCallbackUrl: string;
/** Challenge TTL in seconds (default: 900 = 15 minutes) */
let challengeTtl: number;
/** Stored plugin config for email/hostname access */
let _config: PluginConfig;

// Rate limit: 5 requests per 60 seconds per email
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECS = 60;

// ── Cache key helpers ─────────────────────────────────────────────────────

/** Session cache key for a challenge by its ID. */
const challengeKey = (id: string): string => `flashback:challenge:${id}`;

/** Session cache key for rate-limit tracking by email. */
const rateLimitKey = (email: string): string => `flashback:ratelimit:${email.toLowerCase()}`;

// ── HMAC signing ──────────────────────────────────────────────────────────

/**
 * Sign a JSON payload with HMAC-SHA256.
 *
 * The signature covers the canonical JSON serialization of the payload.
 * FlashBack verifies the signature using the same shared secret.
 *
 * @param payload - Object to sign (will be JSON-serialized)
 * @param secret - HMAC shared secret
 * @returns Hex-encoded HMAC-SHA256 signature
 */
function signPayload(payload: object, secret: string): string {
    return createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
}

// ── Rate limiting ─────────────────────────────────────────────────────────

/**
 * Check and enforce rate limit for /flashback/init per email.
 *
 * Uses a sliding window stored in the session cache. Timestamps older than
 * the window are pruned on each check.
 *
 * @param email - Email address to rate-limit
 * @returns true if the request is allowed, false if rate-limited
 */
async function checkRateLimit(email: string): Promise<boolean> {
    const session = getSession();
    const key = rateLimitKey(email);
    const now = Date.now();
    const windowStart = now - (RATE_LIMIT_WINDOW_SECS * 1000);

    const entry: RateLimitEntry | undefined = await session.get(key);
    const timestamps = entry?.timestamps?.filter((t: number) => t > windowStart) || [];

    if (timestamps.length >= RATE_LIMIT_MAX) {
        return false;
    }

    timestamps.push(now);
    await session.set(key, { timestamps }, RATE_LIMIT_WINDOW_SECS);
    return true;
}

// ── Client credentials authentication ─────────────────────────────────────

/**
 * Verify OIDC client credentials from HTTP Basic Auth header.
 *
 * The /flashback/init endpoint is server-to-server, authenticated with the
 * FlashBack OIDC client's client_id and client_secret via HTTP Basic Auth.
 *
 * @param req - Express request with Authorization header
 * @returns The authenticated client_id, or null if credentials are invalid
 */
async function verifyClientCredentials(req: Request): Promise<string | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return null;
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
        return null;
    }

    const clientId = decoded.slice(0, colonIndex);
    const clientSecret = decoded.slice(colonIndex + 1);

    const client = await Client.findByClientId(clientId);
    if (!client) {
        return null;
    }

    // Compare client secret (stored as plain text in the clients table)
    return client.client_secret === clientSecret ? clientId : null;
}

// ── Callback dispatcher ──────────────────────────────────────────────────

/**
 * POST an HMAC-signed approval callback to the FlashBack server.
 *
 * Sends a JSON payload to {callbackUrl}/api/sessions/{sessionId}/activate
 * with an X-Flashback-Signature header containing the HMAC-SHA256 signature.
 *
 * @param challenge - The resolved challenge data
 * @param userId - The approved user's account ID
 */
async function sendApprovalCallback(challenge: FlashbackChallenge, userId: string): Promise<void> {
    const payload: ApprovalCallbackPayload = {
        userId,
        email: challenge.email,
        sessionId: challenge.sessionId,
        action: 'approve',
        timestamp: Date.now(),
    };

    const signature = signPayload(payload, sharedSecret);
    const url = `${challenge.callbackUrl}/api/sessions/${challenge.sessionId}/activate`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Flashback-Signature': signature,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        console.error(`FlashBack callback failed: ${response.status} ${response.statusText} for session ${challenge.sessionId}`);
    }
}

/**
 * POST an HMAC-signed denial callback to the FlashBack server.
 *
 * @param challenge - The denied challenge data
 */
async function sendDenialCallback(challenge: FlashbackChallenge): Promise<void> {
    const payload: DenialCallbackPayload = {
        sessionId: challenge.sessionId,
        action: 'deny',
        timestamp: Date.now(),
    };

    const signature = signPayload(payload, sharedSecret);
    const url = `${challenge.callbackUrl}/api/sessions/${challenge.sessionId}/deny`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Flashback-Signature': signature,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        console.error(`FlashBack denial callback failed: ${response.status} ${response.statusText} for session ${challenge.sessionId}`);
    }
}

// ── Email templates ───────────────────────────────────────────────────────

/**
 * Send an approval email to an existing user.
 *
 * Contains an HTTPS link to /flashback/approve/{challengeId} where
 * the user can approve the pending login on their retro device.
 */
async function sendApprovalEmail(email: string, challengeId: string): Promise<void> {
    const transporter = _config.services?.transporter;
    if (!transporter) throw new Error('Email transporter not available');

    const approveUrl = `https://${_config.hostname}/flashback/approve/${challengeId}`;

    await transporter.sendMail({
        from: `"${_config.site_name}" <noreply@${_config.hostname}>`,
        to: email,
        subject: `${_config.site_name} - Approve FlashBack Login`,
        text: `Someone is trying to log in to FlashBack as ${email}.\n\nIf this is you, visit the link below to approve:\n${approveUrl}\n\nThis link expires in ${Math.floor(challengeTtl / 60)} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<h2>${_config.site_name} - FlashBack Login Approval</h2>
<p>Someone is trying to log in to FlashBack as <strong>${email}</strong>.</p>
<p>If this is you, click the button below to approve:</p>
<p><a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;">Approve Login</a></p>
<p><small>This link expires in ${Math.floor(challengeTtl / 60)} minutes.</small></p>
<p><small>If you did not request this, you can safely ignore this email.</small></p>`,
    });

    console.log(`FlashBack approval email sent to ${email} (challenge: ${challengeId})`);
}

/**
 * Send a registration email to a new user.
 *
 * Contains an HTTPS link to /flashback/register/{challengeId} where
 * the user can create an account and auto-approve the pending login.
 */
async function sendRegistrationEmail(email: string, challengeId: string): Promise<void> {
    const transporter = _config.services?.transporter;
    if (!transporter) throw new Error('Email transporter not available');

    const registerUrl = `https://${_config.hostname}/flashback/register/${challengeId}`;

    await transporter.sendMail({
        from: `"${_config.site_name}" <noreply@${_config.hostname}>`,
        to: email,
        subject: `${_config.site_name} - Create Account for FlashBack`,
        text: `Someone wants to use FlashBack with this email address.\n\nClick the link below to create an account and approve the login:\n${registerUrl}\n\nThis link expires in ${Math.floor(challengeTtl / 60)} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<h2>${_config.site_name} - Create Account for FlashBack</h2>
<p>Someone wants to use FlashBack with this email address.</p>
<p>Click the button below to create an account and approve the login:</p>
<p><a href="${registerUrl}" style="display:inline-block;padding:12px 24px;background:#28a745;color:#fff;text-decoration:none;border-radius:4px;">Create Account &amp; Approve</a></p>
<p><small>This link expires in ${Math.floor(challengeTtl / 60)} minutes.</small></p>
<p><small>If you did not request this, you can safely ignore this email.</small></p>`,
    });

    console.log(`FlashBack registration email sent to ${email} (challenge: ${challengeId})`);
}

// ── HTML page templates ───────────────────────────────────────────────────

/**
 * Render a simple HTML page with consistent styling.
 * Self-contained — no dependency on Mustache template engine.
 */
function renderPage(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - ${_config.site_name}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px; color: #333; background: #f8f9fa; }
        .card { background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { font-size: 1.4em; margin-top: 0; }
        .btn { display: inline-block; padding: 10px 24px; border: none; border-radius: 4px; font-size: 1em; cursor: pointer; text-decoration: none; margin: 4px; }
        .btn-primary { background: #007bff; color: #fff; }
        .btn-danger { background: #dc3545; color: #fff; }
        .btn-success { background: #28a745; color: #fff; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 1em; margin: 4px 0 12px; box-sizing: border-box; }
        label { font-weight: 600; display: block; margin-top: 8px; }
        .error { color: #dc3545; background: #f8d7da; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
        .success { color: #155724; background: #d4edda; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
        .muted { color: #6c757d; font-size: 0.9em; }
        .actions { margin-top: 16px; }
    </style>
</head>
<body>
    <div class="card">
        ${body}
    </div>
</body>
</html>`;
}

// ── Plugin definition ─────────────────────────────────────────────────────

const plugin: ExtensionPlugin = {
    meta: {
        name: 'flashback',
        version: '1.0.0',
        type: 'extension',
        description: 'Passwordless retro-auth login flow for HTTP-only FlashBack clients',
    },

    /**
     * Initialize the FlashBack extension.
     *
     * Reads configuration from environment variables:
     * - FLASHBACK_SHARED_SECRET (required) — HMAC shared secret for signing callbacks
     * - FLASHBACK_CALLBACK_URL (required) — default callback URL for FlashBack server
     * - FLASHBACK_CHALLENGE_TTL — challenge expiry in seconds (default: 900)
     *
     * @throws Error if required env vars are missing
     */
    async initialize(config: PluginConfig): Promise<void> {
        _config = config;

        sharedSecret = process.env.FLASHBACK_SHARED_SECRET || '';
        if (!sharedSecret) {
            throw new Error('FlashBack extension requires FLASHBACK_SHARED_SECRET environment variable');
        }

        defaultCallbackUrl = process.env.FLASHBACK_CALLBACK_URL || '';
        if (!defaultCallbackUrl) {
            throw new Error('FlashBack extension requires FLASHBACK_CALLBACK_URL environment variable');
        }
        // Strip trailing slash for consistent URL construction
        defaultCallbackUrl = defaultCallbackUrl.replace(/\/+$/, '');

        challengeTtl = parseInt(process.env.FLASHBACK_CHALLENGE_TTL || '900', 10);

        console.log(`FlashBack extension initialized (TTL: ${challengeTtl}s, callback: ${defaultCallbackUrl})`);
    },

    /**
     * Register FlashBack routes on the Express app.
     *
     * Routes:
     * - POST /flashback/init — Create a challenge (server-to-server, client credentials)
     * - GET  /flashback/approve/:challengeId — Show approval page (HTTPS, browser)
     * - POST /flashback/approve/:challengeId — Approve or deny (HTTPS, browser)
     * - GET  /flashback/register/:challengeId — Show registration form (HTTPS, browser)
     * - POST /flashback/register/:challengeId — Register and auto-approve (HTTPS, browser)
     */
    getRoutes(app: Application): void {

        // ── POST /flashback/init ──────────────────────────────────────────
        // Server-to-server: FlashBack calls this to create a challenge.
        // Authenticated with OIDC client credentials (HTTP Basic Auth).
        // Rate-limited to 5 requests per minute per email.
        app.post('/flashback/init', async (req: Request, res: Response, next: NextFunction) => {
            try {
                // Verify client credentials (returns client_id or null)
                const authenticatedClientId = await verifyClientCredentials(req);
                if (!authenticatedClientId) {
                    return res.status(401).json({ error: 'invalid_client', message: 'Invalid client credentials' });
                }

                const { sessionId, email, callbackUrl } = req.body;

                // Validate required fields
                if (!sessionId || !email) {
                    return res.status(400).json({ error: 'invalid_request', message: 'sessionId and email are required' });
                }

                // Basic email validation
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    return res.status(400).json({ error: 'invalid_request', message: 'Invalid email address' });
                }

                // Rate limit check
                if (!(await checkRateLimit(email))) {
                    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests for this email. Try again later.' });
                }

                // Look up user by email via the provider plugin
                const provider = getProvider();
                let userExists = false;
                if (provider.findByEmail) {
                    const account = await provider.findByEmail(email);
                    userExists = account !== null;
                }

                // Create challenge
                const challengeId = randomUUID();
                const challenge: FlashbackChallenge = {
                    sessionId,
                    email,
                    callbackUrl: (callbackUrl || defaultCallbackUrl).replace(/\/+$/, ''),
                    userExists,
                    status: 'pending',
                    createdAt: Date.now(),
                    initiatingClientId: authenticatedClientId,
                };

                // Store in session cache with TTL
                const session = getSession();
                await session.set(challengeKey(challengeId), challenge, challengeTtl);

                // Send the appropriate email (approval or registration)
                // Do not leak whether the account exists — always return "pending"
                if (userExists) {
                    await sendApprovalEmail(email, challengeId);
                } else {
                    await sendRegistrationEmail(email, challengeId);
                }

                return res.status(200).json({ challengeId, status: 'pending' });
            } catch (err) {
                next(err);
            }
        });

        // ── GET /flashback/approve/:challengeId ───────────────────────────
        // Browser: show approval page for an existing user.
        app.get('/flashback/approve/:challengeId', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { challengeId } = req.params;
                const session = getSession();
                const challenge: FlashbackChallenge | undefined = await session.get(challengeKey(challengeId));

                if (!challenge || challenge.status !== 'pending') {
                    return res.status(404).send(renderPage('Invalid Link', `
                        <h1>Invalid or Expired Link</h1>
                        <p>This approval link is no longer valid. It may have expired or already been used.</p>
                        <p class="muted">Challenges expire after ${Math.floor(challengeTtl / 60)} minutes.</p>
                    `));
                }

                return res.send(renderPage('Approve Login', `
                    <h1>Approve FlashBack Login</h1>
                    <p>A device is trying to log in to FlashBack as <strong>${challenge.email}</strong>.</p>
                    <p>If this was you, click <strong>Approve</strong> to log in on your device.</p>
                    <div class="actions">
                        <form method="POST" style="display:inline">
                            <input type="hidden" name="_csrf" value="${req.csrfToken()}">
                            <input type="hidden" name="action" value="approve">
                            <button type="submit" class="btn btn-primary">Approve</button>
                        </form>
                        <form method="POST" style="display:inline">
                            <input type="hidden" name="_csrf" value="${req.csrfToken()}">
                            <input type="hidden" name="action" value="deny">
                            <button type="submit" class="btn btn-danger">Deny</button>
                        </form>
                    </div>
                `));
            } catch (err) {
                next(err);
            }
        });

        // ── POST /flashback/approve/:challengeId ──────────────────────────
        // Browser: handle approval or denial from the approval page.
        app.post('/flashback/approve/:challengeId', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { challengeId } = req.params;
                const { action } = req.body;
                const session = getSession();
                const challenge: FlashbackChallenge | undefined = await session.get(challengeKey(challengeId));

                if (!challenge || challenge.status !== 'pending') {
                    return res.status(404).send(renderPage('Invalid Link', `
                        <h1>Invalid or Expired Link</h1>
                        <p>This approval link is no longer valid.</p>
                    `));
                }

                if (action === 'approve') {
                    // Look up the user to get their account ID
                    const provider = getProvider();
                    let userId = '';
                    if (provider.findByEmail) {
                        const account = await provider.findByEmail(challenge.email);
                        if (account) {
                            userId = account.accountId;
                        }
                    }

                    if (!userId) {
                        return res.status(500).send(renderPage('Error', `
                            <h1>Something went wrong</h1>
                            <p>Could not find your account. Please try again.</p>
                        `));
                    }

                    // Update challenge status
                    challenge.status = 'approved';
                    await session.set(challengeKey(challengeId), challenge, challengeTtl);

                    // Send signed callback to FlashBack
                    await sendApprovalCallback(challenge, userId);

                    // Delete the challenge now that it's been used
                    await session.del(challengeKey(challengeId));

                    return res.send(renderPage('Login Approved', `
                        <div class="success">Login approved!</div>
                        <h1>Done!</h1>
                        <p>Your device is now logged in to FlashBack.</p>
                        <p class="muted">You can close this tab.</p>
                    `));
                } else {
                    // Deny
                    challenge.status = 'denied';
                    await session.set(challengeKey(challengeId), challenge, challengeTtl);

                    await sendDenialCallback(challenge);
                    await session.del(challengeKey(challengeId));

                    return res.send(renderPage('Login Denied', `
                        <h1>Login Denied</h1>
                        <p>The login request has been denied. No session was created.</p>
                        <p class="muted">You can close this tab.</p>
                    `));
                }
            } catch (err) {
                next(err);
            }
        });

        // ── GET /flashback/register/:challengeId ──────────────────────────
        // Browser: show registration form for a new user.
        app.get('/flashback/register/:challengeId', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { challengeId } = req.params;
                const session = getSession();
                const challenge: FlashbackChallenge | undefined = await session.get(challengeKey(challengeId));

                if (!challenge || challenge.status !== 'pending') {
                    return res.status(404).send(renderPage('Invalid Link', `
                        <h1>Invalid or Expired Link</h1>
                        <p>This registration link is no longer valid. It may have expired or already been used.</p>
                        <p class="muted">Challenges expire after ${Math.floor(challengeTtl / 60)} minutes.</p>
                    `));
                }

                return res.send(renderPage('Create Account', `
                    <h1>Create Account for FlashBack</h1>
                    <p>Create an account to log in to FlashBack on your retro device.</p>
                    <form method="POST">
                        <input type="hidden" name="_csrf" value="${req.csrfToken()}">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" value="${challenge.email}" readonly>
                        <label for="display_name">Display Name</label>
                        <input type="text" id="display_name" name="display_name" required minlength="5" maxlength="64" placeholder="Your display name">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required minlength="16" placeholder="Min. 16 characters">
                        <label for="password_confirm">Confirm Password</label>
                        <input type="password" id="password_confirm" name="password_confirm" required>
                        <div class="actions">
                            <button type="submit" class="btn btn-success">Create Account &amp; Approve Login</button>
                        </div>
                    </form>
                `));
            } catch (err) {
                next(err);
            }
        });

        // ── POST /flashback/register/:challengeId ─────────────────────────
        // Browser: handle registration form submission.
        // Creates the account via the provider plugin, then auto-approves.
        app.post('/flashback/register/:challengeId', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { challengeId } = req.params;
                const { display_name, password, password_confirm } = req.body;
                const session = getSession();
                const challenge: FlashbackChallenge | undefined = await session.get(challengeKey(challengeId));

                if (!challenge || challenge.status !== 'pending') {
                    return res.status(404).send(renderPage('Invalid Link', `
                        <h1>Invalid or Expired Link</h1>
                        <p>This registration link is no longer valid.</p>
                    `));
                }

                // Validate form input
                const errors: string[] = [];

                if (!display_name || display_name.trim().length < 5 || display_name.trim().length > 64) {
                    errors.push('Display name must be between 5 and 64 characters.');
                }

                if (!password || password.length < 16) {
                    errors.push('Password must be at least 16 characters long.');
                }

                if (password !== password_confirm) {
                    errors.push('Passwords do not match.');
                }

                if (errors.length > 0) {
                    return res.send(renderPage('Create Account', `
                        <h1>Create Account for FlashBack</h1>
                        <div class="error">${errors.join('<br>')}</div>
                        <form method="POST">
                            <input type="hidden" name="_csrf" value="${req.csrfToken()}">
                            <label for="email">Email</label>
                            <input type="email" id="email" name="email" value="${challenge.email}" readonly>
                            <label for="display_name">Display Name</label>
                            <input type="text" id="display_name" name="display_name" value="${display_name || ''}" required minlength="5" maxlength="64">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required minlength="16">
                            <label for="password_confirm">Confirm Password</label>
                            <input type="password" id="password_confirm" name="password_confirm" required>
                            <div class="actions">
                                <button type="submit" class="btn btn-success">Create Account &amp; Approve Login</button>
                            </div>
                        </form>
                    `));
                }

                // Create account via provider plugin
                const provider = getProvider();
                if (!provider.createAccount) {
                    return res.status(500).send(renderPage('Error', `
                        <h1>Registration Not Available</h1>
                        <p>The current provider does not support account creation.</p>
                    `));
                }

                const account = await provider.createAccount({
                    email: challenge.email,
                    displayName: display_name.trim(),
                    password,
                    registeredFromClientId: challenge.initiatingClientId,
                });

                if (!account) {
                    return res.send(renderPage('Create Account', `
                        <h1>Create Account for FlashBack</h1>
                        <div class="error">An account with this email already exists. Please use the approval flow instead.</div>
                    `));
                }

                // Auto-approve: update challenge and send callback
                challenge.status = 'approved';
                await session.set(challengeKey(challengeId), challenge, challengeTtl);

                await sendApprovalCallback(challenge, account.accountId);
                await session.del(challengeKey(challengeId));

                return res.send(renderPage('Account Created', `
                    <div class="success">Account created and login approved!</div>
                    <h1>Welcome to FlashBack!</h1>
                    <p>Your account has been created and your device is now logged in.</p>
                    <p class="muted">You can close this tab.</p>
                `));
            } catch (err) {
                next(err);
            }
        });
    },
};

export default plugin;
