// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// For serverless environments (using connection pooler)
const client = postgres(process.env.MARKETING_SUPABASE_DATABASE_URL!, {
  prepare: false, // Disable prepare for "Transaction" pool mode
});

// For long-running servers (using direct connection)
// const client = postgres(process.env.MARKETING_SUPABASE_DATABASE_DIRECT_URL!);

export const db = drizzle(client);
