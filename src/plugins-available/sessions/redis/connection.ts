import Redis from 'ioredis';

let cache: Redis | null = null;

export function createConnection(url: string): Redis {
    // @ts-ignore -- ioredis constructor typing is wrong for URL strings
    cache = new Redis(url);
    return cache;
}

export function getConnection(): Redis {
    if (!cache) {
        throw new Error('Redis connection not initialized. Call createConnection() first.');
    }
    return cache;
}

export async function closeConnection(): Promise<void> {
    if (cache) {
        await cache.quit();
        cache = null;
    }
}
