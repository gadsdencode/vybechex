import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, matches, insertUserSchema, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq, or, and } from "drizzle-orm";
import { z } from "zod";
import Stripe from 'stripe';

const scryptAsync = promisify(scrypt);

// Initialize Stripe with proper error handling
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true
    });
    console.log('Stripe initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
    // Continue without Stripe - application can still function
  }
} else {
  console.warn('STRIPE_SECRET_KEY not set - Stripe features will be disabled');
}

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Request {
      matchData?: typeof matches.$inferSelect;
    }
  }
}

// Extend express-session to include passport
declare module 'express-session' {
  interface SessionData {
    passport: {
      user: number;
    };
  }
}

// PostgreSQL-based rate limiting (imported from utility)
import { checkMatchRequestLimit, rateLimiter } from './utils/rateLimiter';

// Re-export for use in other modules
export { checkMatchRequestLimit };

export const verifyMatchAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required",
        timestamp: new Date().toISOString()
      });
    }

    const user = req.user as SelectUser;
    const matchId = parseInt(req.params.matchId);

    if (isNaN(matchId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid match ID",
        timestamp: new Date().toISOString()
      });
    }

    // Verify match exists and user has access
    const [match] = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.id, matchId),
          or(
            eq(matches.userId1, user.id),
            eq(matches.userId2, user.id)
          ),
          or(
            eq(matches.status, 'accepted'),
            eq(matches.status, 'requested'),
            eq(matches.status, 'pending')
          )
        )
      )
      .limit(1);

    if (!match) {
      return res.status(404).json({ 
        success: false, 
        message: "Match not found or invalid status",
        timestamp: new Date().toISOString()
      });
    }

    // Check if the match is in a valid state for the requested operation
    if (req.path.includes('/messages')) {
      // For message-related endpoints, only allow if match is accepted
      if (match.status !== 'accepted') {
        return res.status(403).json({
          success: false,
          message: "Match must be accepted to access messages",
          timestamp: new Date().toISOString()
        });
      }
    }

    // Store match data in request for route handlers
    req.matchData = match;
    next();
  } catch (error) {
    console.error('Match verification error:', error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to verify match access",
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get session secret with production safety check.
 * In production, requires SESSION_SECRET env var to be set.
 * Falls back to REPL_ID for Replit deployments.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.REPL_ID;
  
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET environment variable is required in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
  
  // Only use dev fallback in development
  if (!secret) {
    console.warn('⚠️  Using development session secret. Do NOT use in production!');
    return 'dev-only-insecure-fallback-secret-change-in-production';
  }
  
  return secret;
}

export async function setupAuth(app: Express) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for auth to work");
  }

  try {
    const [testUser] = await db
      .select({ id: users.id })
      .from(users)
      .limit(1);
    console.log("Database connection verified");
  } catch (error) {
    console.error("Database connection failed:", error);
    throw new Error("Failed to connect to database");
  }

  // Create PostgreSQL connection pool for sessions
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  });

  // Initialize PostgreSQL session store
  const PgStore = pgSession(session);
  const sessionStore = new PgStore({
    pool: pgPool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
    errorLog: console.error.bind(console)
  });

  // Get session secret with production safety
  const sessionSecret = getSessionSecret();

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false, // PostgreSQL store handles this properly
    saveUninitialized: false,
    rolling: true, // Reset expiration on each request
    cookie: {
      maxAge: 604800000, // 7 days
      secure: app.get("env") === "production",
      sameSite: "lax",
      httpOnly: true,
      path: '/'
    },
    store: sessionStore,
    name: 'sid',
    proxy: app.get("env") === "production"
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    if (sessionSettings.cookie) {
      sessionSettings.cookie.secure = true;
    }
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Cleanup handler for graceful shutdown
  process.on('SIGTERM', () => {
    pgPool.end();
  });

  console.log('PostgreSQL session store initialized');

  // Serialize the entire user object
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  // Deserialize with full user data
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      
      if (!user) {
        return done(null, false);
      }
      
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        console.error('Auth error:', err);
        return done(err);
      }
    })
  );

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid input: " + result.error.issues.map(i => i.message).join(", ")
        });
      }

      const { username, password } = result.data;

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: "Username already exists" 
        });
      }

      const hashedPassword = await crypto.hash(password);
      
      let stripeCustomerId = null;
      
      try {
        // Only attempt to create Stripe customer if stripe is initialized
        if (stripe) {
          const customer = await stripe.customers.create({
            email: username,
            metadata: {
              username: username
            }
          });
          stripeCustomerId = customer.id;
        }
      } catch (stripeError) {
        console.error('Stripe customer creation failed:', stripeError);
        // Continue with user creation even if Stripe fails
      }

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          name: '',
          bio: '',
          quizCompleted: false,
          personalityTraits: {},
          avatar: '/default-avatar.png',
          level: 1,
          xp: 0,
          lastRewardClaimed: new Date()
        })
        .returning();

      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          success: true,
          message: "Registration successful",
          user: { 
            id: newUser.id, 
            username: newUser.username 
          },
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid input", 
        errors: result.error.issues.map(i => i.message)
      });
    }

    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ 
          success: false,
          message: "Internal server error during login"
        });
      }

      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: info?.message || "Invalid username or password"
        });
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Session error:", err);
          return res.status(500).json({ 
            success: false,
            message: "Failed to create session"
          });
        }

        return res.json({
          success: true,
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username
          }
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Logout failed"
        });
      }

      res.json({ 
        success: true,
        message: "Logout successful" 
      });
    });
  });

  app.get("/api/user", async (req, res) => {
    if (req.isAuthenticated() && req.user?.id) {
      try {
        // Fetch fresh user data from the database
        const [userData] = await db
          .select()
          .from(users)
          .where(eq(users.id, req.user.id))
          .limit(1);

        if (!userData) {
          return res.status(401).json({
            success: false,
            message: "User not found"
          });
        }

        return res.json({
          success: true,
          user: userData
        });
      } catch (error) {
        console.error("Error fetching user data:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch user data"
        });
      }
    }

    res.status(401).json({
      success: false,
      message: "Not logged in"
    });
  });
}