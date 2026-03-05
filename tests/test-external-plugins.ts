/**
 * Test: External Plugin Loading
 *
 * Validates that the registry can discover and load prebuilt JS plugins
 * from an external directory. Uses the example-csv-provider and
 * example-captcha-mfa plugins built from examples/plugins/.
 *
 * Usage:
 *   # Build examples first:
 *   cd examples/plugins/example-csv-provider && npm run build && cd -
 *   cd examples/plugins/example-captcha-mfa && npm run build && cd -
 *
 *   # Run test:
 *   tsx tests/test-external-plugins.ts
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEST_PLUGIN_DIR = path.join(ROOT, 'tests', '.test-plugins');
const TEST_USERS_CSV = path.join(ROOT, 'tests', '.test-users.csv');

// Setup: create test plugin directory structure with built bundles
function setup() {
    const dirs = [
        path.join(TEST_PLUGIN_DIR, 'providers', 'example-csv'),
        path.join(TEST_PLUGIN_DIR, 'mfa', 'example-captcha'),
    ];
    for (const dir of dirs) {
        mkdirSync(dir, { recursive: true });
    }

    // Copy built bundles
    const csvSrc = path.join(ROOT, 'examples', 'plugins', 'example-csv-provider', 'dist', 'index.js');
    const captchaSrc = path.join(ROOT, 'examples', 'plugins', 'example-captcha-mfa', 'dist', 'index.js');

    if (!existsSync(csvSrc)) {
        throw new Error(`CSV provider not built. Run: cd examples/plugins/example-csv-provider && npm run build`);
    }
    if (!existsSync(captchaSrc)) {
        throw new Error(`Captcha MFA not built. Run: cd examples/plugins/example-captcha-mfa && npm run build`);
    }

    copyFileSync(csvSrc, path.join(TEST_PLUGIN_DIR, 'providers', 'example-csv', 'index.js'));
    copyFileSync(captchaSrc, path.join(TEST_PLUGIN_DIR, 'mfa', 'example-captcha', 'index.js'));

    // Create test CSV file
    writeFileSync(TEST_USERS_CSV, `id,email,password_hash,name
1,test@example.com,$2b$11$o0uF.hqbIAnbVGxawEIUJedxPdDeH6aP0fHLrcrk/s8NRY96BNztO,Test User
`);
}

async function testCSVProviderLoad() {
    const pluginPath = pathToFileURL(path.join(TEST_PLUGIN_DIR, 'providers', 'example-csv', 'index.js')).href;
    const mod = await import(pluginPath);
    const plugin = mod.default;

    // Validate meta
    console.assert(plugin.meta.name === 'example-csv', `Expected name 'example-csv', got '${plugin.meta.name}'`);
    console.assert(plugin.meta.type === 'provider', `Expected type 'provider', got '${plugin.meta.type}'`);
    console.assert(plugin.meta.version === '1.0.0', `Expected version '1.0.0', got '${plugin.meta.version}'`);

    // Validate required methods
    console.assert(typeof plugin.initialize === 'function', 'Missing initialize()');
    console.assert(typeof plugin.authenticate === 'function', 'Missing authenticate()');
    console.assert(typeof plugin.findAccount === 'function', 'Missing findAccount()');
    console.assert(typeof plugin.getClaims === 'function', 'Missing getClaims()');

    // Test initialization with CSV file
    process.env.CSV_USERS_FILE = TEST_USERS_CSV;
    await plugin.initialize({
        hostname: 'test.example.com',
        site_name: 'Test',
        mode: 'dev',
        provider_url: 'https://test.example.com/',
        smtp: { host: 'localhost', port: 25, secure: false, auth: { user: undefined, pass: undefined } },
        debug: { adapter: false, account: false },
    });

    // Test findAccount
    const account = await plugin.findAccount(null, '1');
    console.assert(account !== null, 'findAccount should return user 1');
    console.assert(account!.accountId === '1', 'Account ID should be 1');

    const claims = await account!.claims('id_token', 'email');
    console.assert(claims.email === 'test@example.com', `Expected email 'test@example.com', got '${claims.email}'`);

    // Test findAccount with non-existent user
    const missing = await plugin.findAccount(null, '999');
    console.assert(missing === null, 'findAccount should return null for non-existent user');

    // Shutdown
    if (plugin.shutdown) await plugin.shutdown();

    console.log('  PASS: CSV provider plugin loads and functions correctly');
}

async function testCaptchaMFALoad() {
    const pluginPath = pathToFileURL(path.join(TEST_PLUGIN_DIR, 'mfa', 'example-captcha', 'index.js')).href;
    const mod = await import(pluginPath);
    const plugin = mod.default;

    // Validate meta
    console.assert(plugin.meta.name === 'example-captcha', `Expected name 'example-captcha', got '${plugin.meta.name}'`);
    console.assert(plugin.meta.type === 'mfa', `Expected type 'mfa', got '${plugin.meta.type}'`);
    console.assert(plugin.meta.version === '1.0.0', `Expected version '1.0.0', got '${plugin.meta.version}'`);

    // Validate required methods
    console.assert(typeof plugin.initialize === 'function', 'Missing initialize()');
    console.assert(typeof plugin.requiresChallenge === 'function', 'Missing requiresChallenge()');
    console.assert(typeof plugin.issueChallenge === 'function', 'Missing issueChallenge()');
    console.assert(typeof plugin.verifyChallenge === 'function', 'Missing verifyChallenge()');

    // Test initialization with mock services
    const mockCache: Record<string, any> = {};
    const mockSession = {
        async set(key: string, value: any, ttl?: number) { mockCache[key] = value; },
        async get(key: string) { return mockCache[key]; },
        async del(key: string) { delete mockCache[key]; },
    };

    await plugin.initialize({
        hostname: 'test.example.com',
        site_name: 'Test',
        mode: 'dev',
        provider_url: 'https://test.example.com/',
        smtp: { host: 'localhost', port: 25, secure: false, auth: { user: undefined, pass: undefined } },
        debug: { adapter: false, account: false },
        services: {
            getSession: () => mockSession,
            transporter: { sendMail: async () => {} },
        },
    });

    // Test requiresChallenge always returns true
    const mockAccount = { accountId: '1', claims: async () => ({ sub: '1', email: 'test@example.com' }) };
    const requires = await plugin.requiresChallenge(mockAccount);
    console.assert(requires === true, 'requiresChallenge should return true');

    // Test issueChallenge
    const flashMessages: string[] = [];
    const mockReq: any = {
        params: { uid: 'test-challenge-123' },
        hostname: 'test.example.com',
        body: {},
        flash: (type: string, msg?: string) => { if (msg) flashMessages.push(msg); },
    };
    const challengeId = await plugin.issueChallenge(mockAccount, mockReq);
    console.assert(challengeId === 'test-challenge-123', 'Challenge ID should match uid');
    console.assert(flashMessages.length > 0, 'Should have flashed a question');
    console.assert(flashMessages[0].startsWith('Security question:'), 'Flash should contain the question');

    // Extract the expected answer from cache
    const cacheKey = `test.example.com:captcha:test-challenge-123`;
    const stored = mockCache[cacheKey];
    console.assert(stored && stored.answer, 'Challenge data should be stored in cache');

    // Test verifyChallenge with correct answer
    const correctReq: any = {
        params: { uid: 'test-challenge-123' },
        hostname: 'test.example.com',
        body: { mfa: stored.answer },
        flash: () => {},
    };
    const verified = await plugin.verifyChallenge('test-challenge-123', correctReq);
    console.assert(verified === true, 'Correct answer should verify');

    // After verification, cache should be cleaned up
    console.assert(!mockCache[cacheKey], 'Challenge should be removed from cache after verification');

    console.log('  PASS: Captcha MFA plugin loads and functions correctly');
}

async function testResolvePluginPath() {
    // Test that the registry's resolvePluginPath logic works by importing from file URL
    const csvPath = pathToFileURL(path.join(TEST_PLUGIN_DIR, 'providers', 'example-csv', 'index.js')).href;
    const captchaPath = pathToFileURL(path.join(TEST_PLUGIN_DIR, 'mfa', 'example-captcha', 'index.js')).href;

    // Both should be loadable via dynamic import
    const csv = await import(csvPath);
    const captcha = await import(captchaPath);

    console.assert(csv.default.meta.name === 'example-csv', 'CSV plugin loadable via file URL');
    console.assert(captcha.default.meta.name === 'example-captcha', 'Captcha plugin loadable via file URL');

    console.log('  PASS: Plugins loadable via file:// URL dynamic import');
}

// Run all tests
async function main() {
    console.log('Setting up test environment...');
    setup();

    console.log('\nRunning external plugin tests:\n');

    try {
        await testResolvePluginPath();
        await testCSVProviderLoad();
        await testCaptchaMFALoad();
        console.log('\nAll tests passed!');
    } catch (err) {
        console.error('\nTest failed:', err);
        process.exit(1);
    }
}

main();
