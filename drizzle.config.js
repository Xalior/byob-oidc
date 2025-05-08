import config from './data/original_config.ts';

export default {
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: config.database_url
  }
}; 
