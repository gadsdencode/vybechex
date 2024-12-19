// server/routes.ts
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { db } from "@db";
import { matches, users, messages } from "@db/schema";
import { eq, and, or, ne, desc } from "drizzle-orm";
import type { SelectUser } from "@db/schema";
import { setupAuth } from "./auth";
import { sql } from "drizzle-orm";

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

// Message validation schema
const messageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty"),
});

type MatchRequest = z.infer<typeof matchRequestSchema>;
type MessageRequest = z.infer<typeof messageSchema>;

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
            eq(matches.userId2, user.id),
            eq(matches.userId1, users.id)
          )
        ))
        .where(and(
          ne(users.id, user.id),
          eq(users.quizCompleted, true)
        ));

      return res.json(potentialMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      return sendError(res, 500, "Failed to fetch matches", error);
    }
  });

  // Get single match by ID
  app.get("/api/matches/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.id);

      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      const [match] = await db
        .select()
        .from(matches)
        .where(and(
          eq(matches.id, matchId),
          or(
            eq(matches.userId1, user.id),
            eq(matches.userId2, user.id)
          )
        ))
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match not found");
      }

      return sendSuccess(res, { match });
    } catch (error) {
      console.error("Error fetching match:", error);
      return sendError(res, 500, "Failed to fetch match", error);
    }
  });

  // Create or update match
  app.post("/api/matches", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { targetUserId } = req.body;

      // Validate request data with detailed error messages
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

        // Check for existing match in both directions
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
          // If match exists, handle based on status and user roles
          if (existingMatch.status === 'requested') {
            // If current user is the target of the request (userId2), accept it
            if (existingMatch.userId2 === user.id) {
              const [updatedMatch] = await tx
                .update(matches)
                .set({ 
                  status: 'accepted',
                  updatedAt: new Date()
                })
                .where(eq(matches.id, existingMatch.id))
                .returning();
              
              // Return complete match details
              return sendSuccess(res, {
                match: {
                  ...updatedMatch,
                  status: 'accepted'
                },
                type: 'updated'
              }, "Match accepted successfully");
            }

            // If current user is the requester (userId1), return pending status
            if (existingMatch.userId1 === user.id) {
              return sendSuccess(res, {
                match: {
                  ...existingMatch,
                  status: 'requested'
                },
                type: 'pending'
              }, "Match request is pending");
            }
          }

          // Handle accepted matches
          if (existingMatch.status === 'accepted') {
            return sendSuccess(res, {
              match: {
                ...existingMatch,
                status: 'accepted'
              },
              type: 'existing'
            }, "Match already exists and is accepted");
          }
          
          // For all other statuses, return existing match with status
          return sendSuccess(res, {
            match: existingMatch,
            type: 'existing'
          }, `Match exists with status: ${existingMatch.status}`);
        }

        // Create new match request
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

        // Return complete match details
        return sendSuccess(res, {
          match: {
            ...newMatch,
            status: 'requested'
          },
          type: 'created'
        }, "Match request sent successfully");
      });
    } catch (error) {
      console.error("Error processing match:", error);
      return sendError(res, 500, "Failed to process match request", error);
    }
  });

  // Get messages for a match
  app.get("/api/matches/:matchId/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.matchId);

      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      // Verify match exists and user is part of it
      const [match] = await db
        .select()
        .from(matches)
        .where(and(
          eq(matches.id, matchId),
          or(
            eq(matches.userId1, user.id),
            eq(matches.userId2, user.id)
          ),
          eq(matches.status, 'accepted')
        ))
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match not found or not accepted");
      }

      const messages = await db
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt));

      return sendSuccess(res, messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      return sendError(res, 500, "Failed to fetch messages", error);
    }
  });

  // Send a message in a match
  app.post("/api/matches/:matchId/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.matchId);
      const result = messageSchema.safeParse(req.body);

      if (!result.success) {
        return sendError(res, 400, "Invalid message data", result.error.issues);
      }

      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      // Verify match exists and user is part of it
      const [match] = await db
        .select()
        .from(matches)
        .where(and(
          eq(matches.id, matchId),
          or(
            eq(matches.userId1, user.id),
            eq(matches.userId2, user.id)
          ),
          eq(matches.status, 'accepted')
        ))
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match not found or not accepted");
      }

      // Create new message
      const [message] = await db
        .insert(messages)
        .values({
          matchId,
          senderId: user.id,
          content: result.data.content,
          createdAt: new Date(),
        })
        .returning();

      return sendSuccess(res, message);
    } catch (error) {
      console.error("Error sending message:", error);
      return sendError(res, 500, "Failed to send message", error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
