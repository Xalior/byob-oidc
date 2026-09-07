import { LRUCache } from 'lru-cache';
import { Request } from 'express';
import { ProviderPlugin, OIDCAccount } from '../../../plugins/provider/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { runBackend, BackendOptions } from './backend.ts';

const PROTOCOL_VERSION = 1;

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 65_536;
const DEFAULT_CACHE_MAX = 1_000;
const DEFAULT_CACHE_TTL_MS = 30_000;

let authenticateOptions: BackendOptions;
let lookupOptions: BackendOptions;

/**
 * Recent lookup results, so that issuing a token does not run the lookup
 * command every time. Successful lookups only: a miss is never stored, so a
 * newly created account is visible at once. Null when caching is switched off.
 */
let cache: LRUCache<string, Record<string, any>> | null = null;

function numberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0) {
        throw new Error(`stdio-auth: ${name} must be a whole number, got "${raw}"`);
    }
    return value;
}

/**
 * A form body is not trustworthy input. Express turns a repeated field into an
 * array, so `login=a&login=b` arrives as `['a','b']`, and a percent-encoded
 * `%00` arrives as a real NUL. A NUL ends a C string, so a backend written in C
 * would read a different name from the one submitted.
 */
function isCredential(value: unknown): value is string {
    return typeof value === 'string' && !value.includes('\u0000');
}

function account(accountId: string, claims: Record<string, any>): OIDCAccount {
    return {
        accountId,
        async claims() {
            return claims;
        },
    };
}

/** Fetch an account's claims, from the cache when we have them. */
async function lookup(accountId: string): Promise<Record<string, any> | null> {
    const cached = cache?.get(accountId);
    if (cached) return cached;

    const result = await runBackend(
        { version: PROTOCOL_VERSION, operation: 'lookup', account_id: accountId },
        lookupOptions,
    );

    if (result.status === 'fault') {
        console.error(`[stdio-auth] lookup failed: ${result.reason}`);
        return null;
    }
    if (result.status === 'rejected') return null;

    if (result.accountId !== accountId) {
        console.error(
            `[stdio-auth] lookup of "${accountId}" returned account_id "${result.accountId}"; ignoring the reply`,
        );
        return null;
    }

    cache?.set(accountId, result.claims);
    return result.claims;
}

const plugin: ProviderPlugin = {
    meta: {
        name: 'stdio-auth',
        version: '1.0.0',
        type: 'provider',
        description: 'Authenticates against any command that follows the stdio-auth JSON contract',
    },

    async initialize(_config: PluginConfig) {
        const authenticateCommand = process.env.STDIO_AUTH_AUTHENTICATE_COMMAND;
        const lookupCommand = process.env.STDIO_AUTH_LOOKUP_COMMAND;

        if (!authenticateCommand) {
            throw new Error('stdio-auth provider requires STDIO_AUTH_AUTHENTICATE_COMMAND');
        }
        if (!lookupCommand) {
            throw new Error('stdio-auth provider requires STDIO_AUTH_LOOKUP_COMMAND');
        }

        const timeoutMs = numberFromEnv('STDIO_AUTH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
        const maxOutputBytes = numberFromEnv('STDIO_AUTH_MAX_OUTPUT_BYTES', DEFAULT_MAX_OUTPUT_BYTES);

        authenticateOptions = { command: authenticateCommand, timeoutMs, maxOutputBytes };
        lookupOptions = { command: lookupCommand, timeoutMs, maxOutputBytes };

        const cacheMax = numberFromEnv('STDIO_AUTH_CACHE_MAX', DEFAULT_CACHE_MAX);
        const cacheTtlMs = numberFromEnv('STDIO_AUTH_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS);
        cache = cacheTtlMs > 0 && cacheMax > 0
            ? new LRUCache<string, Record<string, any>>({ max: cacheMax, ttl: cacheTtlMs })
            : null;

        console.log(
            `stdio-auth provider initialized (authenticate: ${authenticateCommand}, lookup: ${lookupCommand}, ` +
            `cache: ${cache ? `${cacheMax} entries for ${cacheTtlMs}ms` : 'off'})`,
        );
    },

    /** A text box, so any name the backend recognises can be typed. */
    loginField: {
        type: 'text',
        label: 'Username',
        placeholder: 'username',
        autocomplete: 'username',
    },

    async authenticate(req: Request): Promise<OIDCAccount | null> {
        const username = req.body.login;
        const password = req.body.password;

        if (!isCredential(username) || !isCredential(password)) {
            console.error('[stdio-auth] refused a login: the submitted name or password was not plain text');
            req.flash('error', 'Login failed, try again.');
            return null;
        }

        const result = await runBackend(
            { version: PROTOCOL_VERSION, operation: 'authenticate', username, password },
            authenticateOptions,
        );

        if (result.status === 'fault') {
            console.error(`[stdio-auth] authentication failed: ${result.reason}`);
        }

        if (result.status !== 'ok') {
            req.flash('error', 'Login failed, try again.');
            return null;
        }

        // The reply carries the claims as well as the verdict, so a login fills
        // the cache and the first token needs no lookup.
        cache?.set(result.accountId, result.claims);

        return account(result.accountId, result.claims);
    },

    async findAccount(_ctx: any, id: string, _token?: any): Promise<OIDCAccount | null> {
        const claims = await lookup(id);
        if (!claims) return null;
        return account(id, claims);
    },

    async getClaims(accountId: string): Promise<Record<string, any>> {
        const claims = await lookup(accountId);
        return claims ?? { sub: accountId };
    },
};

export default plugin;
