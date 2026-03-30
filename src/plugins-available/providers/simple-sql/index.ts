import { ProviderPlugin, OIDCAccount } from '../../../plugins/provider/interface.ts';
import { PluginConfig } from '../../../plugins/types.ts';
import { Account, setPasswordSalt, generateAccountId, hashAccountPassword } from './account.ts';
import { getDb } from './db.ts';
import { users } from './schema.ts';
import { clients } from '../../../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { initializeDb } from './db.ts';
import { initializeEmail } from './email.ts';
import { Request, Application } from 'express';

/** Resolve a client_id string to the integer PK in the clients table. Returns null if not found. */
async function resolveClientPk(clientId: string): Promise<number | null> {
    const row = (await getDb().select({ id: clients.id })
        .from(clients)
        .where(eq(clients.client_id, clientId))
        .limit(1))[0];
    return row?.id ?? null;
}

import register from './routes/register.ts';
import confirm from './routes/confirm.ts';
import reconfirm from './routes/reconfirm.ts';
import profile from './routes/profile.ts';
import lost_password from './routes/lost_password.ts';
import reset_password from './routes/reset_password.ts';

/** Wraps the internal Account class to satisfy OIDCAccount interface */
function wrapAccount(account: Account): OIDCAccount {
    return {
        accountId: account.accountId,
        async claims(use: string, scope: string) {
            return account.claims(use, scope);
        },
    };
}

const plugin: ProviderPlugin = {
    meta: {
        name: 'simple-sql',
        version: '1.0.0',
        type: 'provider',
        description: 'MySQL/SQL provider with bcrypt auth, email confirmation, and user management',
    },

    async initialize(config: PluginConfig) {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error('Simple SQL provider requires DATABASE_URL environment variable');
        }

        const passwordSalt = parseInt(process.env.PASSWORD_SALT || '11', 10);
        setPasswordSalt(passwordSalt);

        await initializeDb(databaseUrl);
        initializeEmail(config);

        console.log(`Simple SQL provider initialized (db: ${databaseUrl.replace(/\/\/.*@/, '//***@')})`);
    },

    async authenticate(req: Request): Promise<OIDCAccount | null> {
        const account = await Account.findByLogin(req);
        if (!account) return null;
        return wrapAccount(account);
    },

    async findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null> {
        const account = await Account.findAccount(ctx, id, token);
        if (!account) return null;
        return wrapAccount(account);
    },

    async getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>> {
        const account = await Account.findAccount(null, accountId);
        if (!account) return { sub: accountId };
        return account.claims(use, scope);
    },

    async findByEmail(email: string): Promise<OIDCAccount | null> {
        const user = (await getDb().select()
            .from(users)
            .where(and(
                eq(users.email, email),
                eq(users.verified, 1),
                eq(users.suspended, 0),
            ))
            .limit(1))[0];

        if (!user) return null;

        const account = new Account(user.account_id, {
            email: user.email,
            display_name: user.display_name,
            user: user,
        });
        return wrapAccount(account);
    },

    async createAccount(data: { email: string; displayName: string; password: string; registeredFromClientId?: string }): Promise<OIDCAccount | null> {
        // Check if user already exists
        const existing = (await getDb().select()
            .from(users)
            .where(eq(users.email, data.email))
            .limit(1))[0];

        if (existing) return null;

        const accountId = generateAccountId();
        const hashedPassword = await hashAccountPassword(data.password);

        // Resolve client_id string to integer FK (falls back to SELF, then null)
        const clientPk = await resolveClientPk(data.registeredFromClientId || 'SELF')
            ?? await resolveClientPk('SELF');

        await getDb().insert(users).values({
            email: data.email,
            account_id: accountId,
            password: hashedPassword,
            display_name: data.displayName,
            verified: 1, // Auto-verified: email was already confirmed via challenge link
            registered_from_client_id: clientPk,
        });

        const account = new Account(accountId, {
            email: data.email,
            display_name: data.displayName,
            user: { id: 0, account_id: accountId, email: data.email, password: '', display_name: data.displayName, verified: 1, suspended: 0, login_attempts: 0 },
        });
        return wrapAccount(account);
    },

    getRoutes(app: Application): void {
        register(app);
        confirm(app);
        reconfirm(app);
        profile(app);
        lost_password(app);
        reset_password(app);
    },
};

export default plugin;
