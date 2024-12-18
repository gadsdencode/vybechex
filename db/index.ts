import { drizzle } from "drizzle-orm/neon-http";
import { neon } from '@neondatabase/serverless';
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL environment variable is missing or empty");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

// Helper function to verify database connectivity
export async function verifyDatabaseConnection(): Promise<{ 
  ok: boolean; 
  error?: Error;
  details?: { timestamp: Date; database: string; version: string; }
}> {
  try {
    const result = await sql<{ 
      now: Date; 
      database: string; 
      version: string; 
    }[]>`
      SELECT 
        current_timestamp as now,
        current_database() as database,
        version() as version
    `;

    if (!result?.[0]) {
      return { ok: false, error: new Error('Invalid database response') };
    }

    return {
      ok: true,
      details: {
        timestamp: result[0].now,
        database: result[0].database,
        version: result[0].version
      }
    };
  } catch (error) {
    console.error('Database connection verification failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error : new Error('Database connection failed')
    };
  }
}

// Verify connection immediately
verifyDatabaseConnection().then(({ ok, error, details }) => {
  if (!ok) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
  console.log('Database connected successfully:', details);
}).catch(error => {
  console.error('Fatal database error:', error);
  process.exit(1);
});

export { db };
