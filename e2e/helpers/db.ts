import { initializeDb, getDb } from '../../src/plugins-available/providers/simple-sql/db.ts';
import { createConnection, getConnection } from '../../src/plugins-available/sessions/redis/connection.ts';
import { config } from '../../src/lib/config.ts';
import { confirmation_codes, users } from '../../src/plugins-available/providers/simple-sql/schema.ts';
import { hashAccountPassword } from '../../src/plugins-available/providers/simple-sql/account.ts';
import { eq, and, desc } from 'drizzle-orm';

let initialized = false;

export function ensureInitialized() {
    if (!initialized) {
        initializeDb(config.database_url);
        createConnection(config.cache_url);
        initialized = true;
    }
}

export async function resetAdminUser(password: string) {
    ensureInitialized();
    const res = await getDb().update(users).set({
        login_attempts: 0,
        password: await hashAccountPassword(password),
    }).where(eq(users.id, 1));
    console.log("Reset admin 'account':", res[0]['info']);

    const res2 = await getDb().delete(confirmation_codes).where(eq(confirmation_codes.user_id, 1));
    console.log("Reset admin 'confirmation_codes':", res2[0]['affectedRows']);
}

export async function getUnusedConfirmationCode(userId: number) {
    ensureInitialized();
    return (await getDb().select()
        .from(confirmation_codes)
        .where(
            and(
                eq(confirmation_codes.user_id, userId),
                eq(confirmation_codes.used, false)
            )
        )
        .limit(1))[0];
}

export async function getMfaPin(interactionId: string): Promise<{ pin: string } | null> {
    ensureInitialized();
    const cache = getConnection();
    const raw: any = await cache.call('JSON.GET', `${config.hostname}:mfaCode:${interactionId}`);
    return raw ? JSON.parse(raw) : null;
}

export { getDb, getConnection, config };
