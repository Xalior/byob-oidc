import { mysqlTable, text, int, timestamp } from 'drizzle-orm/mysql-core';
import { sql } from "drizzle-orm";

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  account_id: text('account_id').notNull(),
  email: text('email').notNull(),
  password: text('password').notNull(), // Should store hashed passwords only
  verified: int('verified').notNull().default(0),
  suspended: int('suspended').notNull().default(0),
  hmac_key: text('hmac_key'),
  display_name: text('display_name').notNull(),
  confirmation_attempts: int('confirmation_attempts').default(0),
  login_attempts: int('login_attempts').default(0),
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

export const clients = mysqlTable('clients', {
  id: int('id').primaryKey().autoincrement(),
  client_id: text('client_id').notNull(),
  client_secret: text('client_secret').notNull(),
  grant_requirements: text('grant_requirements'),
  grant_types: text('grant_types'),
  redirect_uris: text('redirect_uris'),
  post_logout_redirect_uris: text('post_logout_redirect_uris'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
