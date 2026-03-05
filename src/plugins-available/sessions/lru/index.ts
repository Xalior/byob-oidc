import { SessionPlugin } from '../../../plugins/session/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { createAdapter } from './adapter.ts';
import type { AdapterConstructor } from '../../../plugins/session/interface.ts';

const store = new Map<string, { value: any; expiresAt: number | null }>();

function cleanup() {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt && entry.expiresAt <= now) {
            store.delete(key);
        }
    }
}

// Periodic cleanup every 30 seconds
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const plugin: SessionPlugin = {
    meta: { name: 'lru', version: '1.0.0', type: 'session', description: 'In-memory session store for development/testing' },

    async initialize(_config: PluginConfig) {
        cleanupInterval = setInterval(cleanup, 30_000);
        console.log('LRU session plugin initialized (in-memory, no persistence)');
    },

    async shutdown() {
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
        store.clear();
    },

    getAdapterConstructor(): AdapterConstructor {
        return createAdapter(store);
    },

    // No express-session store — uses default MemoryStore

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        store.set(key, {
            value,
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
        });
    },

    async get(key: string): Promise<any | undefined> {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            store.delete(key);
            return undefined;
        }
        return entry.value;
    },

    async del(key: string): Promise<void> {
        store.delete(key);
    },

    isConnected(): boolean {
        return true; // Always connected — it's in-memory
    },
};

export default plugin;
