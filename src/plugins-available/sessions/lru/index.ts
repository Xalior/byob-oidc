import { LRUCache } from 'lru-cache';
import { SessionPlugin } from '../../../plugins/session/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { createAdapter, setClientFinder as setAdapterClientFinder } from './adapter.ts';
import type { AdapterConstructor } from '../../../plugins/session/interface.ts';

const DEFAULT_MAX = 10_000;

/**
 * Bounded in-memory store. Entries leave either when their TTL has passed and
 * something touches them, or when the cache is full and the least recently used
 * entry is evicted to make room.
 *
 * Eviction can discard a session that has not expired, so SESSION_LRU_MAX must
 * stay comfortably above the number of live sessions.
 */
let store: LRUCache<string, any>;

const plugin: SessionPlugin = {
    meta: { name: 'lru', version: '1.0.0', type: 'session', description: 'Bounded in-memory session store for development/testing' },

    async initialize(_config: PluginConfig) {
        const max = parseInt(process.env.SESSION_LRU_MAX || String(DEFAULT_MAX), 10);
        store = new LRUCache<string, any>({ max });
        console.log(`LRU session plugin initialized (in-memory, no persistence, max ${max} entries)`);
    },

    async shutdown() {
        store?.clear();
    },

    getAdapterConstructor(): AdapterConstructor {
        return createAdapter(store);
    },

    // No express-session store — uses default MemoryStore

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        store.set(key, value, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined);
    },

    async get(key: string): Promise<any | undefined> {
        return store.get(key);
    },

    async del(key: string): Promise<void> {
        store.delete(key);
    },

    isConnected(): boolean {
        return true; // Always connected — it's in-memory
    },

    setClientFinder(finder: (id: string) => Promise<any>): void {
        setAdapterClientFinder(finder);
    },
};

export default plugin;
