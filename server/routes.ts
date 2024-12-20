import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { db } from "@db";
import { matches, users, messages } from "@db/schema";
import { eq, and, or, ne, desc, sql } from "drizzle-orm";
import type { SelectUser } from "@db/schema";

// Helper functions for consistent API responses
const sendError = (res: Response, status: number, message: string, details?: any) => {
  const response = {
    success: false,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString()
  };
  console.error(`Error ${status}: ${message}`, details);
  return res.status(status).json(response);
};

const sendSuccess = (res: Response, data: any, message?: string) => {
  return res.json({
    success: true,
    data,
    ...(message && { message })
  });
};

// Auth middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return sendError(res, 401, "Authentication required");
  }

  const user = req.user as SelectUser;
  if (!user?.id) {
    return sendError(res, 401, "Invalid session");
  }

  next();
};

export function registerRoutes(app: Express): Server {
  // Create the HTTP server first
  const httpServer = createServer(app);

  // API routes that require authentication
  app.get("/api/matches", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      console.log("Fetching matches for user:", user.id);

      const potentialMatches = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        personalityTraits: users.personalityTraits,
        avatar: users.avatar,
        createdAt: users.createdAt,
        matchStatus: matches.status,
        matchId: matches.id,
        compatibilityScore: sql<number>`COALESCE(0, 0)`, // Default compatibility score
      })
        .from(users)
        .leftJoin(matches, or(
          and(
            eq(matches.userId1, user.id),
            eq(matches.userId2, users.id)
          ),
          and(
            eq(matches.userId2, user.id),
            eq(matches.userId1, users.id)
          )
        ))
        .where(and(
          ne(users.id, user.id),
          eq(users.quizCompleted, true)
        ));

      console.log("Found matches:", potentialMatches.length);
      return sendSuccess(res, potentialMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      return sendError(res, 500, "Failed to fetch matches", error);
    }
  });

  // Other routes can be added here...

  return httpServer;
}