/**
 * FlashBack Protocol Test Client
 *
 * A standalone test harness for the FlashBack retro-auth protocol.
 * Starts a local HTTP server to receive callbacks, initiates a challenge,
 * and verifies the HMAC-signed response.
 *
 * Usage:
 *   npx tsx client.ts --email user@example.com
 *
 * Required environment variables:
 *   BYOB_URL          — Base URL of the BYOB-OIDC server (e.g. https://dev.id.example.com)
 *   CLIENT_ID         — OIDC client_id registered in the BYOB-OIDC clients table
 *   CLIENT_SECRET     — OIDC client_secret for this client
 *
 * Optional:
 *   CALLBACK_PORT     — Port for the local callback server (default: 9999)
 *   CALLBACK_HOST     — Hostname/IP the BYOB server can reach (default: localhost)
 *
 * What it does:
 *   1. Starts a local HTTP server listening for /api/sessions/:id/activate and /deny
 *   2. Calls POST {BYOB_URL}/flashback/init with client credentials
 *   3. Prints the challengeId and waits for the user to approve/deny via email link
 *   4. When the callback arrives, verifies the HMAC-SHA256 signature
 *   5. Prints the result and exits
 */

import http from 'node:http';
import { createHmac } from 'node:crypto';
import { parseArgs } from 'node:util';

// ── CLI args ──────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
    options: {
        email: { type: 'string', short: 'e' },
        'session-id': { type: 'string', short: 's' },
        help: { type: 'boolean', short: 'h' },
    },
});

if (args.help || !args.email) {
    console.log(`
FlashBack Protocol Test Client

Usage:
  npx tsx client.ts --email <user@example.com> [--session-id <id>]

Required env vars:
  BYOB_URL        Base URL of the BYOB-OIDC server
  CLIENT_ID       OIDC client_id
  CLIENT_SECRET   OIDC client_secret

Optional env vars:
  CALLBACK_PORT   Local callback server port (default: 9999)
  CALLBACK_HOST   Hostname the BYOB server can reach (default: localhost)

Example:
  BYOB_URL=https://dev.id.example.com \\
  CLIENT_ID=flashback-dev \\
  CLIENT_SECRET=my-secret \\
  npx tsx client.ts --email user@example.com
`);
    process.exit(0);
}

// ── Config ────────────────────────────────────────────────────────────────

const BYOB_URL = process.env.BYOB_URL?.replace(/\/+$/, '');
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_PORT = parseInt(process.env.CALLBACK_PORT || '9999', 10);
const CALLBACK_HOST = process.env.CALLBACK_HOST || 'localhost';

if (!BYOB_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('ERROR: BYOB_URL, CLIENT_ID, and CLIENT_SECRET env vars are required.');
    process.exit(1);
}

const email = args.email!;
const sessionId = args['session-id'] || `test-${Date.now()}`;
const callbackUrl = `http://${CALLBACK_HOST}:${CALLBACK_PORT}`;

// ── HMAC verification ─────────────────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature against a JSON body.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifySignature(body: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    if (signature.length !== expected.length) return false;

    // Timing-safe comparison
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;

    let diff = 0;
    for (let i = 0; i < sigBuf.length; i++) {
        diff |= sigBuf[i] ^ expBuf[i];
    }
    return diff === 0;
}

// ── Callback server ───────────────────────────────────────────────────────

/**
 * Start a local HTTP server that receives FlashBack callbacks.
 * Handles both /api/sessions/:id/activate and /api/sessions/:id/deny.
 */
function startCallbackServer(): Promise<{ action: string; body: any; signatureValid: boolean }> {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let rawBody = '';
            req.on('data', (chunk) => { rawBody += chunk; });
            req.on('end', () => {
                const signature = (req.headers['x-flashback-signature'] as string) || '';
                const signatureValid = verifySignature(rawBody, signature, CLIENT_SECRET!);

                let body: any;
                try {
                    body = JSON.parse(rawBody);
                } catch {
                    body = rawBody;
                }

                const url = req.url || '';
                const isActivate = url.includes('/activate');
                const isDeny = url.includes('/deny');
                const action = isActivate ? 'APPROVED' : isDeny ? 'DENIED' : 'UNKNOWN';

                console.log('\n' + '='.repeat(60));
                console.log(`CALLBACK RECEIVED: ${action}`);
                console.log('='.repeat(60));
                console.log(`  Method:    ${req.method}`);
                console.log(`  URL:       ${req.url}`);
                console.log(`  Signature: ${signature}`);
                console.log(`  Valid:     ${signatureValid ? 'YES' : 'NO — SIGNATURE MISMATCH'}`);
                console.log(`  Body:      ${JSON.stringify(body, null, 2)}`);
                console.log('='.repeat(60));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true }));

                server.close();
                resolve({ action, body, signatureValid });
            });
        });

        server.listen(CALLBACK_PORT, () => {
            console.log(`Callback server listening on http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
        });
    });
}

// ── Init challenge ────────────────────────────────────────────────────────

async function initChallenge(): Promise<{ challengeId: string; status: string } | null> {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    console.log('\nInitiating FlashBack challenge...');
    console.log(`  BYOB Server:  ${BYOB_URL}`);
    console.log(`  Client ID:    ${CLIENT_ID}`);
    console.log(`  Email:        ${email}`);
    console.log(`  Session ID:   ${sessionId}`);
    console.log(`  Callback URL: ${callbackUrl}`);

    let response: Response;
    try {
        response = await fetch(`${BYOB_URL}/flashback/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`,
            },
            body: JSON.stringify({ sessionId, email, callbackUrl }),
        });
    } catch (err: any) {
        console.error(`\nERROR: Could not connect to ${BYOB_URL}/flashback/init`);
        console.error(`  ${err.message}`);
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error(`\nERROR: /flashback/init returned ${response.status} (${contentType})`);
        console.error(`  Response is not JSON. Is EXTENSIONS=flashback set in your .env?`);
        console.error(`  Body: ${text.substring(0, 200)}`);
        return null;
    }

    const body = await response.json();

    if (!response.ok) {
        console.error(`\nERROR: /flashback/init returned ${response.status}`);
        console.error(JSON.stringify(body, null, 2));
        return null;
    }

    return body;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('FlashBack Protocol Test Client');
    console.log('-'.repeat(40));

    // Start callback server first
    const callbackPromise = startCallbackServer();

    // Initiate the challenge
    const result = await initChallenge();
    if (!result) {
        process.exit(1);
    }

    console.log(`\nChallenge created!`);
    console.log(`  Challenge ID: ${result.challengeId}`);
    console.log(`  Status:       ${result.status}`);
    console.log(`\nCheck the email for ${email} and click the approve/deny link.`);
    console.log('Waiting for callback...\n');

    // Wait for the callback
    const callback = await callbackPromise;

    if (!callback.signatureValid) {
        console.error('\nWARNING: HMAC signature verification FAILED.');
        console.error('The callback may have been tampered with.');
        process.exit(1);
    }

    if (callback.action === 'APPROVED') {
        console.log('\nSession activated successfully!');
        console.log(`  User ID: ${callback.body.userId}`);
        console.log(`  Email:   ${callback.body.email}`);
    } else if (callback.action === 'DENIED') {
        console.log('\nSession was denied by the user.');
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
