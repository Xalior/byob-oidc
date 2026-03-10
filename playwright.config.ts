import { defineConfig } from '@playwright/test';

const CONTAINER_PORT = 3033;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: 'list',
    timeout: 60000,
    globalSetup: './e2e/global-setup.ts',
    globalTeardown: './e2e/global-teardown.ts',
    use: {
        baseURL: 'https://dev.id.nextbestnetwork.com',
        ignoreHTTPSErrors: true,
        connectOptions: {
            wsEndpoint: process.env.BROWSER_WS_ENDPOINT || `ws://localhost:${CONTAINER_PORT}/chromium/playwright`,
        },
    },
    projects: [
        {
            name: 'chromium',
            use: {},
        },
    ],
});
