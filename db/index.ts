import { drizzle } from "drizzle-orm/neon-http";
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import * as schema from "@db/schema";

// Validate environment variables early
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "DATABASE_URL environment variable is missing or empty. Ensure the database is properly provisioned.",
  );
}

let sql: NeonQueryFunction;
let db: ReturnType<typeof drizzle>;

// Initialize database with connection retry
async function initializeDatabase(retries = 3, delay = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Create the SQL client with proper error handling
      sql = neon(process.env.DATABASE_URL!);
      
      // Test the connection before initializing Drizzle
      const testResult = await testConnection();
      if (!testResult.ok) {
        throw new Error(`Connection test failed: ${testResult.error?.message}`);
      }

      // Initialize Drizzle with the verified connection
      db = drizzle(sql, { schema });

      console.log(`Database initialized successfully on attempt ${attempt}`);
      return;
    } catch (error) {
      console.error(`Database initialization attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        throw new Error(`Failed to initialize database after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Enhanced connection test with detailed diagnostics
async function testConnection() {
  try {
    if (!sql) {
      return {
        ok: false,
        error: new Error('SQL client not initialized')
      };
    }

    const result = await sql`
      SELECT 
        current_timestamp as now,
        current_database() as database,
        version() as version
    `;

    if (!result?.[0]?.now) {
      return {
        ok: false,
        error: new Error('Invalid database response')
      };
    }

    return {
      ok: true,
      timestamp: result[0].now,
      database: result[0].database,
      version: result[0].version
    };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error : new Error('Unknown database error')
    };
  }
}

// Initialize database on module load
await initializeDatabase().catch(error => {
  console.error('Fatal database initialization error:', error);
  process.exit(1);
});

// Export initialized instances and utilities
export { sql, db, testConnection, initializeDatabase };
