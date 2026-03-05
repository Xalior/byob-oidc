import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

let cache: RedisType | null = null;

export function createConnection(url: string): RedisType {
    // @ts-ignore -- ioredis constructor typing is wrong for URL strings
    const conn: RedisType = new Redis(url);
    cache = conn;
    return conn;
}

export function getConnection(): RedisType {
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
