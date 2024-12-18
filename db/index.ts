import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from "@db/schema";

// Verify required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Database connection requires proper configuration.");
}

// Configure neon for WebSocket support
neonConfig.webSocketConstructor = ws;

// Create the SQL connection
const sql = neon(process.env.DATABASE_URL);

// Create the database instance with HTTP handler
export const db = drizzle(sql, { schema });

// Simple connection test function with proper error handling
export async function testConnection() {
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
