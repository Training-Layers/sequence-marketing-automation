import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

// Parse connection string components
const directUrlRegex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)$/;
const matches = process.env.MARKETING_SUPABASE_DATABASE_DIRECT_URL!.match(directUrlRegex);

if (!matches) {
  throw new Error('Invalid direct URL format');
}

const [, user, password, host, port, database] = matches;

export default {
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',

  // Database credentials broken down from direct URL
  dbCredentials: {
    host,
    port: parseInt(port),
    user,
    password,
    database,
    ssl: {
      rejectUnauthorized: false,
    },
  },

  // Migration settings
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },

  // Handle all tables in schema
  tablesFilter: [
    'source_records',
    'contacts',
    'persons',
    'organizations',
    'organization_members',
    'clickup_tasks',
  ],

  // Safety settings
  strict: true,
  verbose: true,

  // Custom naming for migrations
} satisfies Config;
