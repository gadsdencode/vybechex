import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";

const app = express();

// Basic middleware setup - before auth to ensure body parsing is available
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/copilotkit", express.static(path.join(__dirname, '../public')));

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

// Start the server with proper error handling
(async () => {
  try {
    // Initialize authentication first
    await setupAuth(app);
    console.log("Authentication system initialized");

    // Register API routes before Vite/static middleware
    const server = registerRoutes(app);

    // Global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Error:', {
        status: err.status || err.statusCode || 500,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });

      // Don't send error stack in production
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Send JSON response for API routes, HTML for others
      if (_req.path.startsWith('/api')) {
        res.status(status).json({
          success: false,
          message: app.get('env') === 'development' ? message : 'Internal Server Error',
          ...(app.get('env') === 'development' && { stack: err.stack })
        });
      } else {
        res.status(status).send(message);
      }
    });

    // Setup Vite or static serving AFTER API routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Start listening
    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});