import { SessionPlugin } from '../../../plugins/session/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { createAdapter, setClientFinder as setAdapterClientFinder } from './adapter.ts';
import { getConnection, createConnection, closeConnection } from './connection.ts';
import type { AdapterConstructor } from '../../../plugins/session/interface.ts';

const plugin: SessionPlugin = {
    meta: { name: 'redis', version: '1.0.0', type: 'session' },

    async initialize(config: PluginConfig) {
        const cacheUrl = process.env.CACHE_URL;
        if (!cacheUrl) {
            throw new Error('Redis session plugin requires CACHE_URL environment variable');
        }
        createConnection(cacheUrl);
        console.log('cache: ' + cacheUrl);
    },

    async shutdown() {
        await closeConnection();
    },

    getAdapterConstructor(): AdapterConstructor {
        return createAdapter(getConnection());
    },

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        const cache = getConnection();
        const multi = cache.multi();
        multi.call('JSON.SET', key, '.', JSON.stringify(value));
        if (ttlSeconds) {
            multi.expire(key, ttlSeconds);
        }
        await multi.exec();
    },

    async get(key: string): Promise<any | undefined> {
        const cache = getConnection();
        const item: any = await cache.call('JSON.GET', key);
        if (!item) return undefined;
        return JSON.parse(item);
    },

    async del(key: string): Promise<void> {
        const cache = getConnection();
        await cache.del(key);
    },

    isConnected(): boolean {
        try {
            return getConnection().status === 'ready';
        } catch {
            return false;
        }
    },

    setClientFinder(finder: (id: string) => Promise<any>): void {
        setAdapterClientFinder(finder);
    },
};

export default plugin;
