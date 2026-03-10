import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface PluginSchemaPushOptions {
    /** Absolute path(s) to the plugin's Drizzle schema file(s) */
    schemaPath: string | string[];
    /** Table names this plugin owns — drizzle-kit will only touch these */
    tables: string[];
    /** MySQL connection URL */
    databaseUrl: string;
}

/**
 * Run drizzle-kit push scoped to a plugin's own tables.
 *
 * Uses `tablesFilter` so drizzle-kit only sees the listed tables,
 * making it safe to use `--force` without risking other plugins'
 * or core tables.
 */
export async function pushPluginSchema(opts: PluginSchemaPushOptions): Promise<void> {
    const { schemaPath, tables, databaseUrl } = opts;

    if (tables.length === 0) {
        throw new Error('pushPluginSchema: tables list must not be empty');
    }

    // Write a temporary drizzle config scoped to this plugin's tables
    const tmpId = randomBytes(6).toString('hex');
    const tmpConfigPath = join(tmpdir(), `drizzle-plugin-${tmpId}.js`);

    const configContent = `export default ${JSON.stringify({
        schema: schemaPath,
        dialect: 'mysql',
        dbCredentials: { url: databaseUrl },
        tablesFilter: tables,
    }, null, 2)};\n`;

    try {
        writeFileSync(tmpConfigPath, configContent);

        execSync(
            `npx drizzle-kit push --config=${tmpConfigPath} --force`,
            {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, DATABASE_URL: databaseUrl },
                timeout: 30_000,
            }
        );
    } finally {
        try { unlinkSync(tmpConfigPath); } catch { /* ignore cleanup errors */ }
    }
}
