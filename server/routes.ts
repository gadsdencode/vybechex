// server/routes.ts

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { users, matches, messages } from "@db/schema";
import type { SelectUser } from "@db/schema";
import type { InsertUser } from "@db/schema";
import { db } from "@db";
import { and, eq, ne, desc, or, sql } from "drizzle-orm";
import { crypto } from "./auth.js";
import { generateConversationSuggestions, craftMessageFromSuggestion, generateEventSuggestions } from "./utils/openai";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: SelectUser;
      isAuthenticated(): boolean;
    }
  }
}

// Utility function to calculate compatibility score between two users
function calculateCompatibilityScore(
  traits1: Record<string, number> | null | undefined,
  traits2: Record<string, number> | null | undefined
): number {
  if (!traits1 || !traits2) return 0;

  const commonTraits = Object.keys(traits1).filter(trait => trait in traits2);
  if (commonTraits.length === 0) return 0;

  const totalDifference = commonTraits.reduce((sum, trait) => {
    const value1 = traits1[trait] || 0;
    const value2 = traits2[trait] || 0;
    // Calculate similarity (1 - difference)
    return sum + (1 - Math.abs(value1 - value2));
  }, 0);

  // Return percentage (0-100)
  return Math.round((totalDifference / commonTraits.length) * 100);
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Standardized error response
  const sendError = (res: Response, status: number, message: string, details?: any, id?: number) => {
    const response = {
      success: false,
      message,
      ...(details && { details }),
      ...(app.get('env') === 'development' && { debug: details })
    };
    return res.status(status).json(response);
  };

  // Standardized success response
  const sendSuccess = (res: Response, data: any, message?: string) => {
    return res.json({
      success: true,
      data,
      ...(message && { message })
    });
  };

  // Auth middleware
  const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.isAuthenticated()) {
      return sendError(res, 401, "Authentication required");
    }
    
    const user = req.user as SelectUser;
    if (!user?.id) {
      return sendError(res, 401, "Invalid session");
    }

    next();
  };

  // Development-only route to create test users
  if (app.get("env") === "development") {
    app.post("/api/dev/create-test-users", async (req, res) => {
      try {
        // Create test users with predefined personality traits
        const testUsers = [
          {
            username: "test_user1",
            name: "Alex Johnson",
            bio: "Love hiking and photography",
            traits: {
              extraversion: 0.8,
              communication: 0.7,
              openness: 0.9,
              values: 0.6,
              planning: 0.4,
              sociability: 0.8
            }
          },
          {
            username: "test_user2",
            name: "Sam Wilson",
            bio: "Bookworm and coffee enthusiast",
            traits: {
              extraversion: 0.3,
              communication: 0.8,
              openness: 0.7,
              values: 0.9,
              planning: 0.8,
              sociability: 0.4
            }
          }
        ];

        for (const testUser of testUsers) {
          const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.username, testUser.username))
            .limit(1);

          if (!existingUser) {
            const hashedPassword = await crypto.hash('testpass123');
            await db.insert(users).values({
              username: testUser.username,
              password: hashedPassword,
              name: testUser.name,
              bio: testUser.bio,
              quizCompleted: true,
              personalityTraits: testUser.traits,
              createdAt: new Date()
            });
          }
        }

        return sendSuccess(res, { message: "Test users created successfully" });
      } catch (error) {
        console.error("Error creating test users:", error);
        return sendError(res, 500, "Failed to create test users", error);
      }
    });
  }

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
            eq(matches.userId1, users.id),
            eq(matches.userId2, user.id)
          )
        ))
        .where(and(
          ne(users.id, user.id),
          eq(users.quizCompleted, true)
        ));

      // Transform the data to match the client's expected format
      const matchesWithScores = potentialMatches.map((result) => {
        const score = calculateCompatibilityScore(
          user.personalityTraits || {},
          result.personalityTraits || {}
        );

        return {
          id: result.id,
          username: result.username,
          name: result.name || result.username,
          personalityTraits: result.personalityTraits || {},
          avatar: result.avatar || "/default-avatar.png",
          createdAt: result.createdAt?.toISOString() || new Date().toISOString(),
          status: result.matchStatus || 'none',
          compatibilityScore: score,
          // Add empty interests array as it's computed on the client side
          interests: []
        };
      });

      // Sort by compatibility score and send the array directly
      const sortedMatches = matchesWithScores
        .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      // Debug log
      console.log('Sending matches response:', {
        isArray: Array.isArray(sortedMatches),
        length: sortedMatches.length,
        sample: sortedMatches[0]
      });

      // Send the raw array as the response
      return res.json(sortedMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      return sendError(res, 500, "Failed to fetch matches", error);
    }
  });

  // Get user profile and match status
  app.get("/api/matches/:id", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user as SelectUser;
      const targetId = parseInt(req.params.id);

      if (isNaN(targetId)) {
        return sendError(res, 400, "Invalid user ID format");
      }

      // Prevent viewing own profile through matches endpoint
      if (currentUser.id === targetId) {
        return sendError(res, 400, "Invalid request", "Cannot view own profile as a match");
      }

      // Find the target user with limited public information
      const targetUser = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        avatar: users.avatar,
        personalityTraits: users.personalityTraits,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

      if (!targetUser || targetUser.length === 0) {
        return sendError(res, 404, "User not found", `No user exists with ID ${targetId}`);
      }

      // Find if there's an existing match between the users
      const matchRecord = await db.select()
        .from(matches)
        .where(
          or(
            and(
              eq(matches.userId1, currentUser.id),
              eq(matches.userId2, targetId)
            ),
            and(
              eq(matches.userId1, targetId),
              eq(matches.userId2, currentUser.id)
            )
          )
        )
        .limit(1);

      // Calculate basic compatibility score
      const compatibilityScore = calculateCompatibilityScore(
        currentUser.personalityTraits,
        targetUser[0].personalityTraits
      );

      // Return user profile with match status
      return sendSuccess(res, {
        ...targetUser[0],
        matchStatus: matchRecord?.[0]?.status || 'none',
        compatibilityScore,
        canInitiateMatch: !matchRecord || matchRecord.length === 0,
        matchId: matchRecord?.[0]?.id
      });
    } catch (error) {
      console.error('Error in match profile endpoint:', error);
      return sendError(res, 500, "Server error", "Failed to retrieve user profile and match status");
    }
  });

  // Create new match
  app.post("/api/matches/:id", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user as SelectUser;
      const targetId = parseInt(req.params.id);

      if (isNaN(targetId)) {
        return sendError(res, 400, "Invalid user ID format");
      }

      // Verify target user exists
      const targetUser = await db.select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);

      if (!targetUser || targetUser.length === 0) {
        return sendError(res, 404, "User not found", `No user exists with ID ${targetId}`);
      }

      // Check for existing match
      const existingMatch = await db.select()
        .from(matches)
        .where(
          or(
            and(
              eq(matches.userId1, currentUser.id),
              eq(matches.userId2, targetId)
            ),
            and(
              eq(matches.userId1, targetId),
              eq(matches.userId2, currentUser.id)
            )
          )
        )
        .limit(1);

      if (existingMatch && existingMatch.length > 0) {
        return sendError(res, 400, "Match already exists", "A match already exists between these users", existingMatch[0].id);
      }

      // Create new match
      const [newMatch] = await db.insert(matches)
        .values({
          userId1: currentUser.id,
          userId2: targetId,
          status: 'pending',
          createdAt: new Date()
        })
        .returning();

      return sendSuccess(res, newMatch);
    } catch (error) {
      console.error('Error creating match:', error);
      return sendError(res, 500, "Server error", "Failed to create match");
    }
  });

  // Connect with a match
  app.post("/api/matches/:id/connect", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.id);
      
      if (isNaN(matchId) || matchId <= 0) {
        return sendError(res, 400, "Invalid match ID. Please provide a valid positive number.");
      }

      // Check if match already exists
      const [existingMatch] = await db
        .select()
        .from(matches)
        .where(
          or(
            and(
              eq(matches.userId1, user.id),
              eq(matches.userId2, matchId)
            ),
            and(
              eq(matches.userId1, matchId),
              eq(matches.userId2, user.id)
            )
          )
        )
        .limit(1);

      if (existingMatch) {
        if (existingMatch.status === 'requested') {
          // Update to accepted if current user received the request
          if (existingMatch.userId2 === user.id) {
            const [updatedMatch] = await db
              .update(matches)
              .set({ status: 'accepted' })
              .where(eq(matches.id, existingMatch.id))
              .returning();
            return sendSuccess(res, updatedMatch);
          }
        }
        return sendSuccess(res, existingMatch);
      }

      // Create new match request
      const [newMatch] = await db
        .insert(matches)
        .values({
          userId1: user.id,
          userId2: matchId,
          status: 'requested',
          createdAt: new Date()
        })
        .returning();

      return sendSuccess(res, newMatch);
    } catch (error) {
      console.error("Error connecting match:", error);
      return sendError(res, 500, "Failed to connect match", error);
    }
  });

  // Get messages for a match
  app.get("/api/matches/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const matchId = parseInt(req.params.id);
      
      if (isNaN(matchId) || matchId <= 0) {
        return sendError(res, 400, "Invalid match ID. Please provide a valid positive number.");
      }

      // Verify match exists and user is part of it
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            )
          )
        )
        .limit(1);

      if (!match) {
        return sendError(res, 404, "Match not found");
      }

      if (match.status !== 'accepted') {
        return sendError(res, 403, "Match must be accepted to view messages");
      }

      const messageList = await db
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt));

      return sendSuccess(res, messageList);
    } catch (error) {
      console.error("Error fetching messages:", error);
      return sendError(res, 500, "Failed to fetch messages", error);
    }
  });

  // Quiz submission
  app.post("/api/quiz", async (req, res) => {
    if (!req.user) return sendError(res, 401, "Not authenticated");
    const { traits } = req.body;
    
    console.log("Quiz submission for user:", req.user.id, "traits:", traits);
    
    try {
      const [updatedUser] = await db.update(users)
        .set({ 
          personalityTraits: traits, 
          quizCompleted: true 
        })
        .where(eq(users.id, req.user.id))
        .returning();

      console.log("Updated user:", updatedUser);

      // Send back updated user data
      return sendSuccess(res, { user: updatedUser });
    } catch (error) {
      console.error("Error updating user quiz:", error);
      return sendError(res, 500, "Failed to update quiz completion status", error);
    }
  });

  // Create a match request
  app.post("/api/matches", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { userId2, score } = req.body;
      
      if (!userId2 || typeof score !== 'number') {
        return sendError(res, 400, "Invalid request. userId2 and score are required.");
      }

      // Use a transaction to prevent race conditions
      const result = await db.transaction(async (tx) => {
        // Check for existing match
        const [existingMatch] = await tx
          .select()
          .from(matches)
          .where(
            or(
              and(
                eq(matches.userId1, user.id),
                eq(matches.userId2, userId2)
              ),
              and(
                eq(matches.userId1, userId2),
                eq(matches.userId2, user.id)
              )
            )
          )
          .limit(1);

        if (existingMatch) {
          if (existingMatch.status === 'requested') {
            if ((existingMatch.userId1 === userId2 && existingMatch.userId2 === user.id) ||
                (existingMatch.userId2 === userId2 && existingMatch.userId1 === user.id)) {
              const [updatedMatch] = await tx
                .update(matches)
                .set({ status: 'accepted' })
                .where(eq(matches.id, existingMatch.id))
                .returning();
              return { type: 'updated', match: updatedMatch };
            }
          }
          return { type: 'existing', match: existingMatch };
        }

        // Create new match request
        const [newMatch] = await tx
          .insert(matches)
          .values({
            userId1: user.id,
            userId2: userId2,
            score: score,
            status: 'requested',
            createdAt: new Date()
          })
          .returning();
        
        return { type: 'created', match: newMatch };
      });

      return sendSuccess(res, result.match, 
        result.type === 'created' ? 'Match request created' :
        result.type === 'updated' ? 'Match accepted' :
        'Existing match found'
      );
    } catch (error) {
      console.error("Error in match creation:", error);
      return sendError(res, 500, "Failed to process match request", error);
    }
  });

  // Accept or reject a match request
  app.patch("/api/matches/:matchId", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { status } = req.body;
      
      if (!status || !['accepted', 'rejected'].includes(status)) {
        return sendError(res, 400, "Invalid status");
      }

      const matchId = parseInt(req.params.matchId);
      
      // Create aliases for the users table
      const requesterAlias = users;
      const receiverAlias = users;
      
      // Get the current match with both users' information
      const matchWithUsers = await db
        .select({
          match: matches,
          requester: {
            id: requesterAlias.id,
            username: requesterAlias.username,
            name: requesterAlias.name,
            avatar: requesterAlias.avatar,
            personalityTraits: requesterAlias.personalityTraits
          },
          receiver: {
            id: receiverAlias.id,
            username: receiverAlias.username,
            name: receiverAlias.name,
            avatar: receiverAlias.avatar,
            personalityTraits: receiverAlias.personalityTraits
          }
        })
        .from(matches)
        .leftJoin(requesterAlias, eq(matches.userId1, requesterAlias.id))
        .leftJoin(receiverAlias, eq(matches.userId2, receiverAlias.id))
        .where(eq(matches.id, matchId))
        .limit(1);

      const currentMatch = matchWithUsers[0];

      if (!currentMatch?.match) {
        return sendError(res, 404, "Match not found");
      }

      // Verify the user is the receiver of the request
      if (currentMatch.match.userId2 !== user.id) {
        return sendError(res, 403, "Only the match recipient can accept or reject the request");
      }

      // Only allow accepting/rejecting requested matches
      if (currentMatch.match.status !== 'requested') {
        return sendError(res, 400, "Can only accept/reject pending match requests", 
          `Current status: ${currentMatch.match.status}`);
      }

      // Calculate compatibility score if accepting the match
      let compatibilityScore = 0;
      if (status === 'accepted' && currentMatch.requester && currentMatch.receiver) {
        compatibilityScore = calculateCompatibilityScore(
          currentMatch.requester.personalityTraits,
          currentMatch.receiver.personalityTraits
        );
      }

      const [updatedMatch] = await db
        .update(matches)
        .set({ 
          status,
          ...(status === 'accepted' ? { score: compatibilityScore } : {})
        })
        .where(eq(matches.id, matchId))
        .returning();

      // Ensure requester exists before accessing properties
      const requester = currentMatch.requester ? {
        id: currentMatch.requester.id,
        username: currentMatch.requester.username,
        name: currentMatch.requester.name,
        avatar: currentMatch.requester.avatar || "/default-avatar.png",
        personalityTraits: currentMatch.requester.personalityTraits || {}
      } : null;

      // Ensure receiver exists before accessing properties
      const receiver = currentMatch.receiver ? {
        id: currentMatch.receiver.id,
        username: currentMatch.receiver.username,
        name: currentMatch.receiver.name,
        avatar: currentMatch.receiver.avatar || "/default-avatar.png",
        personalityTraits: currentMatch.receiver.personalityTraits || {}
      } : null;

      if (!requester || !receiver) {
        return sendError(res, 500, "Failed to load user details for match");
      }

      // Prepare response with user details
      const response = {
        ...updatedMatch,
        requester,
        receiver
      };

      return sendSuccess(res, response, 
        status === 'accepted' 
          ? "Match request accepted! You can now start chatting."
          : "Match request rejected."
      );
    } catch (error) {
      console.error("Error updating match:", error);
      return sendError(res, 500, "Failed to update match", error);
    }
  });

  // Get match requests
  app.get("/api/matches/requests", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      if (!user?.id || isNaN(user.id)) {
        return sendError(res, 400, "Invalid user ID format");
      }
      
      // Get all matches where the current user is the recipient (userId2) and status is 'requested'
      const matchRequests = await db
        .select({
          match: matches,
          requester: users
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

      // Format the response
      const formattedRequests = matchRequests.map(request => ({
        id: request.match.id,
        requester: {
          id: request.requester.id,
          username: request.requester.username,
          name: request.requester.name,
          avatar: request.requester.avatar || "/default-avatar.png",
          personalityTraits: request.requester.personalityTraits || {},
          createdAt: request.requester.createdAt
        },
        status: request.match.status,
        createdAt: request.match.createdAt
      }));

      return res.json({ requests: formattedRequests });
    } catch (error) {
      console.error("Error fetching match requests:", error);
      return sendError(res, 500, "Failed to fetch match requests");
    }
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", requireAuth, async (req: Request, res: Response) => {
    try {
      const { matchId } = req.body;
      if (!matchId || isNaN(parseInt(matchId))) {
        return sendError(res, 400, "Valid match ID is required");
      }
      
      // Type assertion since requireAuth ensures req.user exists
      const user = req.user as SelectUser;
      const parsedMatchId = parseInt(matchId);
      
      // Get match with both users
      const [matchDetails] = await db
        .select({
          id: matches.id,
          userId1: matches.userId1,
          userId2: matches.userId2,
          status: matches.status
        })
        .from(matches)
        .where(
          and(
            eq(matches.id, parsedMatchId),
            or(
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            )
          )
        )
        .limit(1);

      if (!matchDetails) {
        return sendError(res, 404, "Match not found");
      }

      if (matchDetails.status !== 'accepted') {
        return sendError(res, 403, "Match must be accepted to get suggestions");
      }

      // Get the other user's data
      const otherUserId = matchDetails.userId1 === user.id ? matchDetails.userId2 : matchDetails.userId1;
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return sendError(res, 404, "Match user not found");
      }

      // Get recent chat history
      const recentMessages = await db
        .select({
          content: messages.content,
          senderId: messages.senderId
        })
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      const suggestions = await generateConversationSuggestions(
        req.user!.personalityTraits || {},
        otherUser.personalityTraits || {},
        recentMessages.reverse(),
        req.user!.id
      );

      return sendSuccess(res, { suggestions });
    } catch (error) {
      console.error("Error generating suggestions:", error);
      return sendError(res, 500, "Failed to generate suggestions", error);
    }
  });

  // Craft a message from a suggestion
  app.post("/api/craft-message", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { suggestion, matchId } = req.body;
      
      if (!suggestion || !matchId) {
        return sendError(res, 400, "Missing required fields: suggestion and matchId");
      }

      // Join with users table to get personality traits
      const matchResults = await db
        .select({
          match: matches,
          matchUser: users
        })
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            )
          )
        )
        .leftJoin(users, 
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
        );

      const matchWithUser = matchResults[0];
      
      if (!matchWithUser) {
        return sendError(res, 404, "Match not found");
      }

      if (matchWithUser.match.status !== 'accepted') {
        return sendError(res, 403, "Match must be accepted to craft messages");
      }

      const craftedMessage = await craftMessageFromSuggestion(
        suggestion,
        user.personalityTraits || {},
        matchWithUser.matchUser?.personalityTraits || {}
      );

      return sendSuccess(res, { message: craftedMessage });
    } catch (error) {
      console.error("Error crafting message:", error);
      return sendError(res, 500, "Failed to craft message", error);
    }
  });

  // Suggest events
  app.post("/api/events/suggest", requireAuth, async (req, res) => {
    try {
      const user = req.user as SelectUser;
      const { matchId } = req.body;
      
      if (!matchId) {
        return sendError(res, 400, "Match ID is required");
      }

      // Join with users table to get personality traits
      const matchResults = await db
        .select({
          match: matches,
          matchUser: users
        })
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            )
          )
        )
        .leftJoin(users, 
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
        );

      const matchWithUser = matchResults[0];

      if (!matchWithUser) {
        return sendError(res, 404, "Match not found");
      }

      if (!matchWithUser.matchUser) {
        return sendError(res, 404, "Match user not found");
      }

      const suggestions = await generateEventSuggestions(
        user.personalityTraits || {},
        matchWithUser.matchUser.personalityTraits || {}
      );

      return sendSuccess(res, { suggestions });
    } catch (error) {
      console.error("Error generating event suggestions:", error);
      return sendError(res, 500, "Failed to generate event suggestions", error);
    }
  });

  // Get user details
  app.get("/api/users/:userId", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return sendError(res, 400, "Invalid user ID");
      }

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          bio: users.bio,
          personalityTraits: users.personalityTraits,
          quizCompleted: users.quizCompleted,
          createdAt: users.createdAt
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return sendError(res, 404, "User not found");
      }

      return sendSuccess(res, user);
    } catch (error) {
      console.error("Error fetching user:", error);
      return sendError(res, 500, "Failed to fetch user details", error);
    }
  });

  // Get single match - consolidated endpoint
  app.get("/api/matches/:matchId", requireAuth, async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return sendError(res, 400, "Invalid match ID");
      }

      // Get match with both users' information
      const [matchWithUsers] = await db
        .select({
          match: {
            id: matches.id,
            status: matches.status,
            userId1: matches.userId1,
            userId2: matches.userId2,
            score: matches.score,
            createdAt: matches.createdAt
          },
          matchUser: {
            id: users.id,
            username: users.username,
            name: users.name,
            personalityTraits: users.personalityTraits
          }
        })
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, req.user!.id),
              eq(matches.userId2, req.user!.id)
            )
          )
        )
        .leftJoin(users, eq(users.id, 
          sql`CASE 
            WHEN ${matches.userId1} = ${req.user!.id} THEN ${matches.userId2}
            ELSE ${matches.userId1}
          END`
        ))
        .limit(1);

      if (!matchWithUsers) {
        return sendError(res, 404, "Match not found or unauthorized");
      }

      if (!matchWithUsers.matchUser) {
        return sendError(res, 404, "Match user not found");
      }

      // Format response
      const matchUser = matchWithUsers.matchUser;
      const userTraits = req.user!.personalityTraits || {};
      const matchTraits = matchUser!.personalityTraits || {};

    // Generate suggestions based on personality traits
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant providing conversation suggestions for two people getting to know each other. Keep suggestions natural, friendly, and aligned with their personality traits."
          },
          {
            role: "user",
            content: `Generate 3 conversation starters or questions based on these personality traits:
              Person 1 traits: ${JSON.stringify(userTraits)}
              Person 2 traits: ${JSON.stringify(matchTraits)}
              Make them natural and engaging, focusing on common interests or complementary traits.`
          }
        ]
      });

      const suggestions = completion.choices[0].message.content?.split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => line.replace(/^\d+\.\s*/, ''))
        .slice(0, 3) || [];

      return sendSuccess(res, { suggestions });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return sendError(res, 500, "Failed to generate suggestions", error);
    }
  });

  // Get chat suggestions based on personality traits
  app.post("/api/chat/suggest", requireAuth, async (req, res) => {
    try {
      const { matchId } = req.body;
      if (!matchId) {
        return sendError(res, 400, "Match ID is required");
      }

      // Type assertion since requireAuth ensures req.user exists
      const user = req.user as SelectUser;
      if (!user) {
        return sendError(res, 401, "Authentication required");
      }
      
      // Find the match and both users' personality traits
      const [matchWithUser] = await db
        .select({
          match: matches,
          matchUser: {
            id: users.id,
            username: users.username,
            name: users.name,
            personalityTraits: users.personalityTraits
          }
        })
        .from(matches)
        .where(
          and(
            or(
              and(
                eq(matches.userId1, user.id),
                eq(matches.userId2, parseInt(matchId))
              ),
              and(
                eq(matches.userId1, parseInt(matchId)),
                eq(matches.userId2, user.id)
              )
            ),
            eq(matches.status, 'accepted')
          )
        )
        .leftJoin(users, eq(users.id, 
          sql`CASE 
            WHEN ${matches.userId1} = ${user.id} THEN ${matches.userId2}
            ELSE ${matches.userId1}
          END`
        ))
        .limit(1);

      if (!matchWithUser) {
        return sendError(res, 404, "Match not found or not accepted");
      }

      if (!matchWithUser.matchUser) {
        return sendError(res, 404, "Match user not found");
      }

      const matchUser = matchWithUser.matchUser;
      const userTraits = user.personalityTraits || {};
      const matchTraits = matchUser!.personalityTraits || {};

    // Generate suggestions based on personality traits
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant providing conversation suggestions for two people getting to know each other. Keep suggestions natural, friendly, and aligned with their personality traits."
          },
          {
            role: "user",
            content: `Generate 3 conversation starters or questions based on these personality traits:
              Person 1 traits: ${JSON.stringify(userTraits)}
              Person 2 traits: ${JSON.stringify(matchTraits)}
              Make them natural and engaging, focusing on common interests or complementary traits.`
          }
        ]
      });

      const suggestions = completion.choices[0].message.content?.split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => line.replace(/^\d+\.\s*/, ''))
        .slice(0, 3) || [];

      return sendSuccess(res, { suggestions });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return sendError(res, 500, "Failed to generate suggestions", error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}