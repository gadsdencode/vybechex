import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, matches, insertUserSchema, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq, or, and } from "drizzle-orm";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

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

// Rate limiting for match requests
const matchRequestLimits = new Map<number, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_HOUR = 20;
const HOUR_IN_MS = 3600000;

const checkMatchRequestLimit = (userId: number): boolean => {
  const now = Date.now();
  const userLimit = matchRequestLimits.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    matchRequestLimits.set(userId, { count: 1, resetTime: now + HOUR_IN_MS });
    return true;
  }

  if (userLimit.count >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }

  userLimit.count++;
  return true;
};

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
          eq(matches.status, 'accepted')
        )
      )
      .limit(1);

    if (!match) {
      return res.status(404).json({ 
        success: false, 
        message: "Match not found or access denied",
        timestamp: new Date().toISOString()
      });
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

  const MemoryStore = createMemoryStore(session);
  const sessionStore = new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
    stale: false, // Delete expired sessions immediately
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    dispose: (key: string, sess: session.SessionData) => {
      // Cleanup any resources when session expires
      console.log(`Session ${key} expired`);
    }
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on each request
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Will be set to true in production
      sameSite: "lax",
      httpOnly: true,
      path: '/'
    },
    store: sessionStore,
    name: 'sid', // Custom session ID name
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
    sessionStore.stopInterval();
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

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

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

      return done(null, user);
    } catch (err) {
      console.error('Session deserialize error:', err);
      return done(err);
    }
  });

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

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
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

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json({
        success: true,
        user: req.user
      });
    }

    res.status(401).json({
      success: false,
      message: "Not logged in"
    });
  });
}