import { execSync } from 'child_process';

const CONTAINER_NAME = 'byob-e2e-chromium';
const CONTAINER_PORT = 3033;
const IMAGE = 'ghcr.io/browserless/chromium:latest';

function ensureDocker(): void {
    try {
        execSync('docker info', { stdio: 'pipe' });
    } catch {
        throw new Error(
            'Docker is not available. Please install Docker and ensure it is running.\n' +
            'https://docs.docker.com/get-docker/'
        );
    }
}

function ensureImage(): void {
    try {
        const out = execSync(`docker images -q ${IMAGE}`, { encoding: 'utf-8' });
        if (out.trim()) return;
    } catch { /* fall through to pull */ }

    console.log(`Image "${IMAGE}" not found locally, pulling (this may take a while)...`);
    try {
        execSync(`docker pull ${IMAGE}`, { stdio: 'inherit', timeout: 300000 });
    } catch {
        throw new Error(
            `Failed to pull "${IMAGE}". Check your internet connection and Docker Hub access.`
        );
    }
}

function containerExists(): boolean {
    try {
        const out = execSync(`docker ps -a --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}"`, { encoding: 'utf-8' });
        return out.trim() === CONTAINER_NAME;
    } catch {
        return false;
    }
}

function containerRunning(): boolean {
    try {
        const out = execSync(`docker ps --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}"`, { encoding: 'utf-8' });
        return out.trim() === CONTAINER_NAME;
    } catch {
        return false;
    }
}

function waitForReady(timeoutMs = 15000): void {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${CONTAINER_PORT}/json/version`, { encoding: 'utf-8' });
            if (res.trim() === '200') return;
        } catch { /* not ready yet */ }
        execSync('sleep 0.5');
    }
    throw new Error(`Browserless container did not become ready within ${timeoutMs}ms`);
}

export default async function globalSetup() {
    // If BROWSER_WS_ENDPOINT is set, skip container management (CI or remote browser)
    if (process.env.BROWSER_WS_ENDPOINT) {
        console.log(`Using external browser: ${process.env.BROWSER_WS_ENDPOINT}`);
        return;
    }

    ensureDocker();
    ensureImage();

    if (containerRunning()) {
        console.log(`Container "${CONTAINER_NAME}" already running.`);
        waitForReady();
        return;
    }

    if (containerExists()) {
        console.log(`Starting existing container "${CONTAINER_NAME}"...`);
        execSync(`docker start ${CONTAINER_NAME}`);
    } else {
        console.log(`Creating container "${CONTAINER_NAME}"...`);
        execSync(
            `docker run -d --name ${CONTAINER_NAME} -p ${CONTAINER_PORT}:3000 --shm-size="2g" ${IMAGE}`,
            { stdio: 'inherit' }
        );
    }

    waitForReady();
    console.log('Browserless container ready.');
}
