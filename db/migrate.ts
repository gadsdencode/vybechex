import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const runMigration = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Create the database connection
  const sql = postgres(connectionString, { 
    max: 10, // Increase connection pool size
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout after 10 seconds
  });
  const db = drizzle(sql);

  try {
    // Run migrations
    console.log('Running migrations...');
    await migrate(db, {
      migrationsFolder: path.join(__dirname, 'migrations'),
    });
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    // Close the connection
    await sql.end();
  }
};

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
