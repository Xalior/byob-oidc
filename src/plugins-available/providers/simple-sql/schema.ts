import { mysqlTable, text, int, timestamp } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
    id: int('id').primaryKey().autoincrement(),
    account_id: text('account_id').notNull(),
    email: text('email').notNull(),
    password: text('password').notNull(),
    verified: int('verified').notNull().default(0),
    suspended: int('suspended').notNull().default(0),
    hmac_key: text('hmac_key'),
    display_name: text('display_name').notNull(),
    confirmation_attempts: int('confirmation_attempts').default(0),
    login_attempts: int('login_attempts').notNull().default(0),
    confirmation_sent: timestamp('confirmation_sent'),
    confirmed_at: timestamp('confirmed_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
});

export const confirmation_codes = mysqlTable('confirmation_codes', {
    id: int('id').primaryKey().autoincrement(),
    user_id: int('user_id').references(() => users.id),
    confirmation_code: text('confirmation_code').notNull(),
    used: int('used').notNull().default(0),
    created_at: timestamp('created_at').notNull().defaultNow(),
});
