import { drizzle } from "drizzle-orm/mysql2";
import { pushPluginSchema } from '../../../plugins/schema-push.ts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let _db: ReturnType<typeof drizzle> | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.ts');
const TABLES = ['users', 'confirmation_codes'];

export async function initializeDb(databaseUrl: string) {
    if (_db) return _db; // Already initialized

    // Let drizzle-kit push this plugin's tables (CREATE IF NOT EXISTS / ALTER)
    await pushPluginSchema({
        schemaPath: SCHEMA_PATH,
        tables: TABLES,
        databaseUrl,
    });

    _db = drizzle(databaseUrl);
    return _db;
}

export function getDb() {
    if (!_db) {
        throw new Error('Simple SQL provider database not initialized');
    }
    return _db;
}
