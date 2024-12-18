import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db, checkDatabaseHealth, closeDatabaseConnection } from "@db";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware with enhanced error context
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

// Enhanced global error handler with detailed logging
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  // Log error with context
  console.error('Error:', {
    timestamp,
    status,
    message,
    stack: err.stack,
    code: err.code,
    name: err.name
  });
  
  // Don't expose stack traces in production
  const error = app.get('env') === 'development' ? { 
    message,
    stack: err.stack,
    timestamp
  } : { message };
  
  res.status(status).json(error);
});

let server: ReturnType<typeof registerRoutes>;

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Close server first to stop accepting new connections
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }

  try {
    // Close database connections
    await closeDatabaseConnection();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }

  // Exit process
  process.exit(0);
}

async function startServer() {
  try {
    // Check database health with timeout
    const dbCheckTimeout = setTimeout(() => {
      console.error('Database health check timeout');
      process.exit(1);
    }, 10000);

    try {
      // Verify database connection and health
      const healthCheck = await checkDatabaseHealth();
      clearTimeout(dbCheckTimeout);

      if (!healthCheck.ok) {
        throw new Error(`Database health check failed: ${healthCheck.error}`);
      }

      log('Database connection verified');
      
      // Setup auth with verified database connection
      setupAuth(app);

      // Register routes
      server = registerRoutes(app);

      // Setup Vite or static serving
      if (app.get("env") === "development") {
        await setupVite(app, server);
      } else {
        serveStatic(app);
      }

      const PORT = 5000;
      server.listen(PORT, "0.0.0.0", () => {
        log(`Server running on port ${PORT}`);
      });

      // Register shutdown handlers
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (dbError) {
      clearTimeout(dbCheckTimeout);
      console.error('Database initialization failed:', dbError);
      throw new Error(`Database initialization failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION').catch(console.error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION').catch(console.error);
});

startServer();
