import { mysqlTable, text, int, timestamp } from 'drizzle-orm/mysql-core';

export const clients = mysqlTable('clients', {
  id: int('id').primaryKey().autoincrement(),
  client_id: text('client_id').notNull(),
  client_secret: text('client_secret').notNull(),
  grant_requirements: text('grant_requirements').notNull(),
  grant_types: text('grant_types').notNull(),
  redirect_uris: text('redirect_uris').notNull(),
  post_logout_redirect_uris: text('post_logout_redirect_uris').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
