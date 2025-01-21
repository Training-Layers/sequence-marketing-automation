/**
 * Database Configuration
 * ====================
 * Main database configuration and connection setup.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create the connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString);

// Create the database instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from './schema';
