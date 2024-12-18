import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log('Initializing database connection...');

// Create postgres connection with explicit configuration
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === 'production',
  prepare: false,
  types: {
    bigint: postgres.BigInt,
  },
  debug: process.env.NODE_ENV === 'development',
});

// Create Drizzle ORM instance with schema
export const db = drizzle(queryClient, { schema });

// Export raw client for direct queries if needed
export const sql = queryClient;

// Utility function to test connection
export async function testConnection() {
  try {
    const result = await queryClient`SELECT NOW() as now`;
    return { ok: true, timestamp: result[0].now };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return { ok: false, error };
  }
}
