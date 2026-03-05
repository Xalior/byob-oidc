import { drizzle } from "drizzle-orm/mysql2";

let _db: ReturnType<typeof drizzle> | null = null;

export function initializeDb(databaseUrl: string) {
    _db = drizzle(databaseUrl);
    return _db;
}

export function getDb() {
    if (!_db) {
        throw new Error('Simple SQL provider database not initialized');
    }
    return _db;
}
