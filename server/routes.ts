import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { db } from "@db";
import { matches, users, messages } from "@db/schema";
import { eq, and, or, ne, desc } from "drizzle-orm";
import type { SelectUser } from "@db/schema";
import { setupWebSocketServer } from "./websocket";
import { verifyMatchAccess } from "./auth";

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
    ...(message && { message }),
    timestamp: new Date().toISOString()
  });
};

// Match request validation schema
const matchRequestSchema = z.object({
  targetUserId: z.number().int().positive("User ID must be a positive integer"),
});

// Auth middleware with session verification
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return sendError(res, 401, "Authentication required");
  }

  const user = req.user as SelectUser;
  if (!user?.id) {
    return sendError(res, 401, "Invalid session");
  }

  if (!req.session || !req.session.passport) {
    return sendError(res, 401, "Session expired");
  }

  next();
};

export function registerRoutes(app: Express): Server {
  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket server
  setupWebSocketServer(httpServer);

  // Get match requests
  app.get("/api/matches/requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      const matchRequests = await db
        .select({
          id: matches.id,
          userId1: matches.userId1,
          status: matches.status,
          createdAt: matches.createdAt,
          requester: {
            id: users.id,
            username: users.username,
            name: users.name,
            avatar: users.avatar,
          }
        })
        .from(matches)
        .where(
          and(
            eq(matches.userId2, user.id),
            eq(matches.status, 'requested')
          )
        )
        .innerJoin(users, eq(matches.userId1, users.id))
        .orderBy(desc(matches.createdAt));

      return sendSuccess(res, matchRequests);
    } catch (error) {
      console.error("Error fetching match requests:", error);
      return sendError(res, 500, "Failed to fetch match requests", error);
    }
  });

  // Get matches list
  app.get("/api/matches", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      console.log("Fetching matches for user:", user.id);

      const userMatches = await db.select({
        id: matches.id,
        userId1: matches.userId1,
        userId2: matches.userId2,
        status: matches.status,
        lastActivityAt: matches.lastActivityAt,
        user: {
          id: users.id,
          username: users.username,
          name: users.name,
          avatar: users.avatar,
        }
      })
        .from(matches)
        .where(
          and(
            or(
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            ),
            eq(matches.status, 'accepted')
          )
        )
        .innerJoin(
          users,
          or(
            and(
              eq(matches.userId1, users.id),
              ne(users.id, user.id)
            ),
            and(
              eq(matches.userId2, users.id),
              ne(users.id, user.id)
            )
          )
        )
        .orderBy(desc(matches.lastActivityAt));

      return sendSuccess(res, userMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      return sendError(res, 500, "Failed to fetch matches", error);
    }
  });

  // Create new match request
  app.post("/api/matches", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      const result = matchRequestSchema.safeParse(req.body);

      if (!result.success) {
        return sendError(res, 400, "Invalid input", result.error.issues);
      }

      const { targetUserId } = result.data;

      // Prevent self-matching
      if (targetUserId === user.id) {
        return sendError(res, 400, "Cannot create a match with yourself");
      }

      // Check if target user exists and is active
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!targetUser) {
        return sendError(res, 404, "Target user not found");
      }

      // Check for existing active match or pending request
      const [existingMatch] = await db
        .select()
        .from(matches)
        .where(
          and(
            or(
              and(
                eq(matches.userId1, user.id),
                eq(matches.userId2, targetUserId)
              ),
              and(
                eq(matches.userId1, targetUserId),
                eq(matches.userId2, user.id)
              )
            ),
            or(
              eq(matches.status, 'accepted'),
              and(
                eq(matches.status, 'requested'),
                eq(matches.userId1, user.id)
              )
            )
          )
        )
        .limit(1);

      if (existingMatch) {
        if (existingMatch.status === 'accepted') {
          return sendError(res, 400, "An active match already exists with this user");
        } else {
          return sendError(res, 400, "You already have a pending request with this user");
        }
      }

      // Create new match request with verification
      const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const [newMatch] = await db
        .insert(matches)
        .values({
          userId1: user.id,
          userId2: targetUserId,
          status: 'requested',
          matchType: 'request',
          verificationCode,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        })
        .returning();

      return sendSuccess(res, {
        ...newMatch,
        verificationCode
      }, "Match request created successfully");
    } catch (error) {
      console.error("Error creating match:", error);
      return sendError(res, 500, "Failed to create match", error);
    }
  });

  // Get chat messages for a match
  app.get("/api/matches/:matchId/messages", requireAuth, verifyMatchAccess, async (req: Request, res: Response) => {
    try {
      if (!req.matchData) {
        return sendError(res, 500, "Match data not available");
      }

      const chatMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          createdAt: messages.createdAt,
          sender: {
            id: users.id,
            username: users.username,
            name: users.name,
            avatar: users.avatar,
          }
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.matchId, req.matchData.id))
        .orderBy(desc(messages.createdAt));

      return sendSuccess(res, chatMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      return sendError(res, 500, "Failed to fetch messages", error);
    }
  });

  // Accept match request
  app.post("/api/matches/:matchId/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.matchId);

      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      // Verify match exists and user is the target
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            eq(matches.userId2, user.id),
            eq(matches.status, 'requested')
          )
        )
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match request not found or cannot be accepted");
      }

      // Accept the match
      const [updatedMatch] = await db
        .update(matches)
        .set({
          status: 'accepted',
          lastActivityAt: new Date()
        })
        .where(eq(matches.id, matchId))
        .returning();

      return sendSuccess(res, updatedMatch, "Match accepted successfully");
    } catch (error) {
      console.error("Error accepting match:", error);
      return sendError(res, 500, "Failed to accept match", error);
    }
  });

  // Reject match request
  app.post("/api/matches/:matchId/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.matchId);

      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      // Verify match exists and user is the target
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            eq(matches.userId2, user.id),
            eq(matches.status, 'requested')
          )
        )
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match request not found or cannot be rejected");
      }

      // Reject the match
      const [updatedMatch] = await db
        .update(matches)
        .set({
          status: 'rejected',
          lastActivityAt: new Date()
        })
        .where(eq(matches.id, matchId))
        .returning();

      return sendSuccess(res, updatedMatch, "Match rejected successfully");
    } catch (error) {
      console.error("Error rejecting match:", error);
      return sendError(res, 500, "Failed to reject match", error);
    }
  });

  return httpServer;
}