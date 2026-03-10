import { execSync } from 'child_process';

const CONTAINER_NAME = 'byob-e2e-chromium';

export default async function globalTeardown() {
    // If BROWSER_WS_ENDPOINT is set, we didn't start the container
    if (process.env.BROWSER_WS_ENDPOINT) return;

    // Stop but don't remove — reuse on next run for faster startup
    try {
        execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
        console.log(`Stopped container "${CONTAINER_NAME}".`);
    } catch {
        // Container may already be stopped
    }
}
