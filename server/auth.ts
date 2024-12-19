import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

// Add login schema
const loginSchema = insertUserSchema.pick({
  username: true,
  password: true,
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

// extend express user object with our schema
declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

export function setupAuth(app: Express) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for auth to work");
  }

  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: true,
    saveUninitialized: true,
    // Configure session cookie settings
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Allow non-HTTPS for development
      sameSite: "lax",
      httpOnly: true,
      path: '/'
    },
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie.secure = true;
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select({
            id: users.id,
            username: users.username,
            password: users.password,
            name: users.name,
            bio: users.bio,
            quizCompleted: users.quizCompleted,
            personalityTraits: users.personalityTraits,
            createdAt: users.createdAt,
            isGroupCreator: users.isGroupCreator,
            avatar: users.avatar
          })
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

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          password: users.password,
          name: users.name,
          bio: users.bio,
          quizCompleted: users.quizCompleted,
          personalityTraits: users.personalityTraits,
          createdAt: users.createdAt,
          isGroupCreator: users.isGroupCreator,
          avatar: users.avatar
        })
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
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map(i => i.message).join(", "));
      }

      const { username, password } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Create the new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
        })
        .returning();

      // Log the user in after registration
      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: { id: newUser.id, username: newUser.username },
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const loginSchema = z.object({
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
      });

      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: result.error.issues.map(i => i.message)
        });
      }

      passport.authenticate("local", async (err: any, user: Express.User | false, info: IVerifyOptions) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ 
            message: "Internal server error during login",
            error: app.get('env') === 'development' ? err.message : undefined
          });
        }

        if (!user) {
          return res.status(401).json({ 
            message: info?.message || "Invalid username or password"
          });
        }

        try {
          await new Promise<void>((resolve, reject) => {
            req.logIn(user, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          return res.json({
            message: "Login successful",
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              quizCompleted: user.quizCompleted,
              isGroupCreator: user.isGroupCreator,
              avatar: user.avatar
            },
          });
        } catch (loginErr) {
          console.error("Session error:", loginErr);
          return res.status(500).json({ 
            message: "Failed to create session",
            error: app.get('env') === 'development' ? loginErr.message : undefined
          });
        }
      })(req, res);
    } catch (error) {
      console.error("Unexpected error during login:", error);
      return res.status(500).json({ 
        message: "An unexpected error occurred",
        error: app.get('env') === 'development' ? error : undefined 
      });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).send("Logout failed");
      }

      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      console.log("Authenticated user:", req.user);
      return res.json(req.user);
    }

    console.log("User not authenticated");
    res.status(401).send("Not logged in");
  });
}