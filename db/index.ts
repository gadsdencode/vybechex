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

// Create WebSocket implementation for Neon
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
  // Explicitly configure WebSocket for non-browser environment
  webSocketConstructor: ws,
  webSocketClass: ws,
};

// Initialize database connection with retries
async function createPool(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const pool = new Pool(poolConfig);

      // Verify connection by making a test query
      await pool.connect();
      
      // Set up event handlers
      pool.on('error', (err) => {
        console.error('Unexpected error on idle client:', err);
      });

      pool.on('connect', () => {
        console.log('New client connected to the pool');
      });

      return pool;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  throw new Error(`Failed to connect after ${retries} attempts`);
}

// Initialize pool and Drizzle instance
const pool = await createPool();
export const db = drizzle(pool, { schema });

// Enhanced health check with comprehensive diagnostics
export async function checkDatabaseHealth() {
  let client;
  try {
    // Test pool status
    if (!pool) {
      return {
        ok: false,
        error: 'Database pool not initialized',
        diagnostics: {
          poolExists: false,
          connectionString: !!process.env.DATABASE_URL,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Attempt to get a client from the pool
    client = await pool.connect();
    
    // Run comprehensive health check query
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
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
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
      try {
        await client.release();
      } catch (releaseError) {
        console.error('Error releasing client:', releaseError);
      }
    }
  }
}

// Graceful shutdown function
export async function closeDatabaseConnection() {
  try {
    await pool.end();
    console.log('Database pool has been closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
    throw error;
  }
}

// Perform initial health check
await checkDatabaseHealth().then(status => {
  if (!status.ok) {
    console.error('Initial database health check failed:', status);
    process.exit(1);
  }
  console.log('Database initialized successfully:', {
    database: status.database,
    poolSize: status.poolSize,
    timestamp: status.timestamp
  });
});
