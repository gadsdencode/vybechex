import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "@db";
import { sql } from "drizzle-orm";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  // Don't expose stack traces in production
  const error = app.get('env') === 'development' ? { 
    message,
    stack: err.stack 
  } : { message };
  
  res.status(status).json(error);
});

async function startServer() {
  try {
    // Test database connection with timeout
    const dbConnectionTimeout = setTimeout(() => {
      console.error('Database connection timeout');
      process.exit(1);
    }, 5000);

    try {
      // Test database connection
      const connTest = await testConnection();
      if (!connTest.ok) {
        throw connTest.error || new Error('Database connection test failed');
      }
      
      clearTimeout(dbConnectionTimeout);
      log('Database connection successful');

      // Create tables in correct order (respecting foreign keys)
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT DEFAULT '' NOT NULL,
          bio TEXT DEFAULT '' NOT NULL,
          quiz_completed BOOLEAN DEFAULT false NOT NULL,
          personality_traits JSONB DEFAULT '{}' NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          is_group_creator BOOLEAN DEFAULT false NOT NULL,
          avatar TEXT DEFAULT '/default-avatar.png' NOT NULL
        );

        CREATE TABLE IF NOT EXISTS matches (
          id SERIAL PRIMARY KEY,
          user_id_1 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_id_2 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          score INTEGER,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('requested', 'pending', 'accepted', 'rejected')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          analyzed BOOLEAN DEFAULT false,
          sentiment JSONB
        );
      `;

      log('Database schema initialized successfully');
    } catch (dbError) {
      clearTimeout(dbConnectionTimeout);
      console.error('Database connection failed:', dbError);
      throw new Error(`Database initialization failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }

    // Setup auth after database connection is verified
    setupAuth(app);

    // Register routes after auth is setup
    const server = registerRoutes(app);

    // Setup Vite or static serving after routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
