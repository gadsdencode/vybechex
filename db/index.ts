import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "@db/schema";
import ws from "ws";

// Validate environment variables early
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "DATABASE_URL environment variable is missing or empty. Ensure the database is properly provisioned.",
  );
}

// Configure pool settings for Neon serverless with proper WebSocket setup
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  },
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  webSocket: {
    constructor: ws,
    class: ws,
    keepAlive: true,
    keepAliveInterval: 30000,
    keepAliveTimeout: 5000
  }
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

      pool.on('connect', (client) => {
        console.log('New database connection established');
      });

      pool.on('acquire', (client) => {
        console.log('Client acquired from pool');
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

// Create a synchronous pool instance for initial connection
const pool = new Pool(poolConfig);

// Export the database instance
export const db = drizzle(pool, { schema });

// Health check function with comprehensive diagnostics
export async function checkDatabaseHealth() {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        current_timestamp as now,
        current_database() as database,
        version() as version,
        pg_is_in_recovery() as is_replica,
        pg_postmaster_start_time() as start_time,
        (SELECT count(*) FROM pg_stat_activity) as active_connections
    `);

    const row = result.rows[0];
    
    return {
      ok: true,
      timestamp: row.now,
      database: row.database,
      version: row.version,
      diagnostics: {
        isReplica: row.is_replica,
        serverStartTime: row.start_time,
        activeConnections: row.active_connections,
        poolStatus: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        }
      }
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
      diagnostics: {
        poolExists: !!pool,
        connectionString: !!process.env.DATABASE_URL,
        errorType: error?.constructor?.name,
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }
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
