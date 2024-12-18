import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@db/schema";

const { Pool } = pg;

// Validate environment variables early
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "DATABASE_URL environment variable is missing or empty. Ensure the database is properly provisioned.",
  );
}

// Configure pool settings
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Initialize pool with singleton pattern
let poolInstance: Pool | null = null;

// Initialize database connection with retries and exponential backoff
async function createPool(retries = 3, backoffMs = 1000): Promise<Pool> {
  if (poolInstance) {
    return poolInstance;
  }

  let lastError = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const pool = new Pool(poolConfig);
      
      // Test the connection with a simple query
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      console.log(`Successfully connected to database after ${i + 1} attempt(s)`);
      
      // Set up event handlers
      pool.on('error', (err) => {
        console.error('Unexpected database pool error:', err);
      });

      poolInstance = pool;
      return pool;
    } catch (error) {
      lastError = error;
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      
      if (i < retries - 1) {
        const delay = backoffMs * Math.pow(2, i);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to connect to database after ${retries} attempts. Last error: ${lastError}`);
}

// Create and initialize the pool
const pool = new Pool(poolConfig);

// Export the database instance
export const db = drizzle(pool, { schema });

// Health check function
export async function checkDatabaseHealth() {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        current_timestamp as now,
        current_database() as database,
        version() as version
    `);

    const row = result.rows[0];
    
    return {
      ok: true,
      timestamp: row.now,
      database: row.database,
      version: row.version
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
      timestamp: new Date().toISOString()
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Graceful shutdown handler
export async function closeDatabaseConnection() {
  try {
    if (poolInstance) {
      await poolInstance.end();
      poolInstance = null;
      console.log('Database pool has been closed');
    }
  } catch (error) {
    console.error('Error closing database pool:', error);
    throw error;
  }
}

// Export the initialization function for explicit initialization when needed
export const initializeDatabase = createPool;
