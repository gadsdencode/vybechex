// server/routes.ts
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { users, matches, messages, type SelectUser } from "@db/schema";
import { db } from "@db";
import { eq, and, ne, desc, or, sql } from "drizzle-orm";
import { z } from "zod";
import { crypto } from "./auth";
import { generateConversationSuggestions, craftMessageFromSuggestion, generateEventSuggestions, generateMatchExplanation } from "./utils/openai";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

// Match request validation schema
const matchRequestSchema = z.object({
  targetUserId: z.number().positive("User ID must be a positive number"),
});

type MatchRequest = z.infer<typeof matchRequestSchema>;


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
  setupAuth(app);

  // Get all matches for the authenticated user with proper error handling
  app.get("/api/matches", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      
      const potentialMatches = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        personalityTraits: users.personalityTraits,
        avatar: users.avatar,
        createdAt: users.createdAt,
        matchStatus: matches.status,
        matchId: matches.id,
        compatibilityScore: sql<number>`0`, // Will be calculated below
      })
        .from(users)
        .leftJoin(matches, or(
          and(
            eq(matches.userId1, user.id),
            eq(matches.userId2, users.id)
          ),
          and(
            eq(matches.userId1, user.id),
            eq(matches.userId2, user.id)
          )
        ))
        .where(and(
          ne(users.id, user.id),
          eq(users.quizCompleted, true)
        ));

      // Sort by compatibility score
      const sortedMatches = potentialMatches.sort((a, b) => {
        const scoreA = typeof a.compatibilityScore === 'number' ? a.compatibilityScore : 0;
        const scoreB = typeof b.compatibilityScore === 'number' ? b.compatibilityScore : 0;
        return scoreB - scoreA;
      });

      return res.json(sortedMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      return sendError(res, 500, "Failed to fetch matches", error);
    }
  });

  // Create new match
  app.post("/api/matches", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { targetUserId } = req.body;

      // Validate request data
      const result = matchRequestSchema.safeParse({ targetUserId });
      if (!result.success) {
        return sendError(res, 400, "Invalid request data", result.error.issues);
      }

      // Prevent self-matching
      if (targetUserId === user.id) {
        return sendError(res, 400, "Cannot create a match with yourself");
      }

      // Use transaction for consistency
      return await db.transaction(async (tx) => {
        // Check if target user exists
        const [targetUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        if (!targetUser) {
          return sendError(res, 404, "Target user not found");
        }

        // Check for existing match
        const [existingMatch] = await tx
          .select()
          .from(matches)
          .where(
            or(
              and(
                eq(matches.userId1, user.id),
                eq(matches.userId2, targetUserId)
              ),
              and(
                eq(matches.userId1, targetUserId),
                eq(matches.userId2, user.id)
              )
            )
          )
          .limit(1);

        if (existingMatch) {
          return sendError(res, 409, "Match already exists");
        }

        // Create new match
        const [newMatch] = await tx
          .insert(matches)
          .values({
            userId1: user.id,
            userId2: targetUserId,
            status: 'requested',
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        return sendSuccess(res, newMatch, "Match request sent successfully");
      });
    } catch (error) {
      console.error("Error creating match:", error);
      return sendError(res, 500, "Failed to create match", error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}