import { drizzle } from "drizzle-orm/neon-http";
import { neon } from '@neondatabase/serverless';
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create the SQL client
const sql = neon(process.env.DATABASE_URL);

// Initialize Drizzle with the Neon client
export const db = drizzle(sql);

// Test connection function
async function testConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    if (!result?.[0]) {
      throw new Error('Invalid response from database');
    }
    return { ok: true, timestamp: result[0].now };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return { 
      ok: false, 
      error: error instanceof Error ? error : new Error('Unknown database error')
    };
  }
}

// Export SQL client and test function
export { sql, testConnection };
