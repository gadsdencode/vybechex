// // server/routes.ts

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.js";
import { users, matches, messages } from "@db/schema";
import type { SelectUser } from "@db/schema";
import type { InsertUser } from "@db/schema";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: SelectUser;
      isAuthenticated(): boolean;
    }
  }
}
import { db } from "@db";
import { and, eq, ne, desc, or, sql } from "drizzle-orm";
import { crypto } from "./auth.js";
import { generateConversationSuggestions, craftMessageFromSuggestion, generateEventSuggestions } from "./utils/openai";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Auth middleware
  const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Ensure user has required properties
    if (typeof req.user.id !== 'number' || typeof req.user.username !== 'string') {
      return res.status(401).json({ message: "Invalid user session" });
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
          },
          {
            username: "test_user3",
            name: "Jordan Lee",
            bio: "Tech geek and gamer",
            traits: {
              extraversion: 0.5,
              communication: 0.6,
              openness: 0.8,
              values: 0.7,
              planning: 0.6,
              sociability: 0.6
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
              password: hashedPassword, // crypto.hash already includes salt
              name: testUser.name,
              bio: testUser.bio,
              quizCompleted: true,
              personalityTraits: testUser.traits,
              createdAt: new Date()
            });
          }
        }

        res.json({ message: "Test users created successfully" });
      } catch (error) {
        console.error("Error creating test users:", error);
        res.status(500).json({ message: "Failed to create test users" });
      }
    });
  }

  // Quiz submission
  app.post("/api/quiz", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
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
      res.json({ 
        success: true,
        user: updatedUser
      });
    } catch (error) {
      console.error("Error updating user quiz:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to update quiz completion status"
      });
    }
  });

  // Get potential matches with compatibility scores
  app.get("/api/matches", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const potentialMatches = await db.select()
      .from(users)
      .leftJoin(matches, or(
        and(
          eq(matches.userId1, req.user.id),
          eq(matches.userId2, users.id)
        ),
        and(
          eq(matches.userId1, users.id),
          eq(matches.userId2, req.user.id)
        )
      ))
      .where(and(
        ne(users.id, req.user.id),
        eq(users.quizCompleted, true)
      ));

    // Calculate compatibility scores
    const currentUserTraits = req.user.personalityTraits || {};
    const matchesWithScores = potentialMatches.map((result) => {
      const user = result.users;
      const existingMatch = result.matches;
      const matchTraits = user.personalityTraits || {};
      let compatibilityScore = 0;
      let traitCount = 0;

      // Compare each personality trait
      for (const trait in currentUserTraits) {
        if (matchTraits[trait] !== undefined) {
          const similarity = 1 - Math.abs(currentUserTraits[trait] - matchTraits[trait]);
          compatibilityScore += similarity;
          traitCount++;
        }
      }

      // Calculate percentage (if there are matching traits)
      const score = traitCount > 0 
        ? Math.round((compatibilityScore / traitCount) * 100)
        : 0;

      return {
        id: user.id.toString(),
        name: user.name || user.username,
        username: user.username,
        avatar: "/default-avatar.png",
        personalityTraits: matchTraits,
        compatibilityScore: score,
        status: existingMatch?.status || 'pending'
      };
    });

    // Sort by compatibility score (highest first)
    const sortedMatches = matchesWithScores.sort((a, b) => 
      b.compatibilityScore - a.compatibilityScore
    );

    res.json(sortedMatches);
  });

  // Get a single match by ID - consolidated endpoint
  app.get("/api/matches/:id", requireAuth, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }

      // Type assertion since requireAuth ensures req.user exists
      const user = req.user as SelectUser;
      
      // Find the match in the database with both users' information
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
              eq(matches.userId1, user.id),
              eq(matches.userId2, user.id)
            )
          )
        )
        .leftJoin(users, eq(users.id, 
          sql`CASE 
            WHEN ${matches.userId1} = ${user.id} THEN ${matches.userId2}
            ELSE ${matches.userId1}
          END`
        ))
        .limit(1);

      if (!matchWithUsers) {
        return res.status(404).json({ message: "Match not found or unauthorized" });
      }

      // Format response
      const matchUser = matchWithUsers.matchUser;
      const matchTraits = matchUser.personalityTraits || {};
      const currentUserTraits = user.personalityTraits || {};
      
      // Calculate compatibility score
      let compatibilityScore = 0;
      let traitCount = 0;
      for (const trait in currentUserTraits) {
        if (matchTraits[trait] !== undefined) {
          const similarity = 1 - Math.abs(currentUserTraits[trait] - matchTraits[trait]);
          compatibilityScore += similarity;
          traitCount++;
        }
      }

      const score = traitCount > 0 
        ? Math.round((compatibilityScore / traitCount) * 100)
        : matchWithUsers.match.score;

      return res.json({
        id: matchId,
        status: matchWithUsers.match.status,
        createdAt: matchWithUsers.match.createdAt,
        score: score,
        name: matchUser.name || matchUser.username,
        username: matchUser.username,
        personalityTraits: matchTraits,
        avatar: "/default-avatar.png"
      });
    } catch (error) {
      console.error("Error fetching match:", error);
      return res.status(500).json({ 
        message: "Failed to fetch match details",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // This route has been consolidated with the one above

  // Create a match request
  app.post("/api/matches", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const { userId2, score } = req.body;
      if (!userId2 || typeof score !== 'number') {
        return res.status(400).json({ message: "Invalid request body" });
      }

      // Check if match already exists
      const [existingMatch] = await db
        .select()
        .from(matches)
        .where(
          or(
            and(
              eq(matches.userId1, req.user.id),
              eq(matches.userId2, userId2)
            ),
            and(
              eq(matches.userId1, userId2),
              eq(matches.userId2, req.user.id)
            )
          )
        )
        .limit(1);

      if (existingMatch) {
        // If match exists, check if we can update it to accepted
        if (existingMatch.status === 'requested') {
          // If the current user is the one who received the request, update to accepted
          if ((existingMatch.userId1 === userId2 && existingMatch.userId2 === req.user.id) ||
              (existingMatch.userId2 === userId2 && existingMatch.userId1 === req.user.id)) {
            const [updatedMatch] = await db
              .update(matches)
              .set({ status: 'accepted' })
              .where(eq(matches.id, existingMatch.id))
              .returning();
            return res.json(updatedMatch);
          }
        }
        // Return the existing match without modification
        return res.json(existingMatch);
      }

      // Create new match request
      const [match] = await db
        .insert(matches)
        .values({
          userId1: req.user.id,
          userId2: userId2,
          score: score,
          status: 'requested'  // Initial state is 'requested'
        })
        .returning();

      res.json(match);
    } catch (error) {
      console.error("Error creating match:", error);
      res.status(500).json({ message: "Failed to create match" });
    }
  });

  // Accept or reject a match
  app.patch("/api/matches/:matchId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const { status } = req.body;
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).send("Invalid status");
    }

    try {
      const matchId = parseInt(req.params.matchId);
      
      // Get the current match
      const [currentMatch] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!currentMatch) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Verify the user is part of this match
      if (currentMatch.userId1 !== req.user.id && currentMatch.userId2 !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to modify this match" });
      }

      // Only allow accepting/rejecting pending matches
      if (currentMatch.status !== 'pending') {
        return res.status(400).json({ 
          message: "Can only accept/reject pending matches",
          currentStatus: currentMatch.status 
        });
      }

      const [updatedMatch] = await db
        .update(matches)
        .set({ status })
        .where(eq(matches.id, matchId))
        .returning();

      res.json(updatedMatch);
    } catch (error) {
      console.error("Error updating match:", error);
      res.status(500).json({ message: "Failed to update match" });
    }
  });

  // Connect with a match
  app.post("/api/matches/:matchId/connect", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }

      // Create or update the match
      const existingMatch = await db.select()
        .from(matches)
        .where(or(
          and(
            eq(matches.userId1, req.user.id),
            eq(matches.userId2, matchId)
          ),
          and(
            eq(matches.userId2, req.user.id),
            eq(matches.userId1, matchId)
          )
        ))
        .limit(1);

      if (existingMatch.length > 0) {
        const updated = await db.update(matches)
          .set({ status: 'pending' })
          .where(eq(matches.id, existingMatch[0].id))
          .returning();
        
        return res.json(updated[0]);
      }

      const newMatch = await db.insert(matches)
        .values({
          userId1: req.user.id,
          userId2: matchId,
          status: 'pending',
          score: 0
        })
        .returning();

      res.json(newMatch[0]);
    } catch (error) {
      console.error("Error connecting match:", error);
      res.status(500).json({ message: "Failed to connect match" });
    }
  });

  // Get messages for a match
  app.get("/api/matches/:matchId/messages", requireAuth, async (req, res) => {
    try {
      // requireAuth middleware already ensures req.user exists

      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }
      
      // First check if match exists and user is part of it
      const [matchWithStatus] = await db
        .select({
          id: matches.id,
          status: matches.status,
          userId1: matches.userId1,
          userId2: matches.userId2
        })
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, req.user.id),
              eq(matches.userId2, req.user.id)
            )
          )
        )
        .limit(1);

      if (!matchWithStatus) {
        return res.status(404).json({ message: "Match not found" });
      }

      const isUserInMatch = 
        matchWithStatus.userId1 === req.user.id || 
        matchWithStatus.userId2 === req.user.id;

      if (!isUserInMatch) {
        return res.status(403).json({ message: "Not authorized to view this match" });
      }

      // Only allow messages for accepted matches
      if (matchWithStatus.status !== 'accepted') {
        return res.status(403).json({ message: "Match must be accepted to view messages" });
      }

      // Get all messages for this match
      const chatMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          matchId: messages.matchId
        })
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(messages.createdAt);

      res.json(chatMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send a message
  app.post("/api/matches/:matchId/messages", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    try {
      const matchId = parseInt(req.params.matchId);
      const { content } = req.body;

      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }

      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Message content is required" });
      }

      // Verify match exists and user is part of it
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      if (match.userId1 !== req.user.id && match.userId2 !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to send messages in this match" });
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          matchId,
          senderId: req.user.id,
          content: content.trim(),
          createdAt: new Date(),
          analyzed: false
        })
        .returning();

      res.json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", requireAuth, async (req: Request, res: Response) => {
    try {
      const { matchId } = req.body;
      if (!matchId || isNaN(parseInt(matchId))) {
        return res.status(400).json({ message: "Valid match ID is required" });
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
              eq(matches.userId1, req.user.id),
              eq(matches.userId2, req.user.id)
            )
          )
        )
        .limit(1);

      if (!matchDetails) {
        return res.status(404).json({ message: "Match not found" });
      }

      if (matchDetails.status !== 'accepted') {
        return res.status(403).json({ message: "Match must be accepted to get suggestions" });
      }

      // Get the other user's data
      const otherUserId = matchDetails.userId1 === userId ? matchDetails.userId2 : matchDetails.userId1;
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).json({ message: "Match user not found" });
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

      res.json({ suggestions });
    } catch (error) {
      console.error("Error generating suggestions:", error);
      res.status(500).json({ message: "Failed to generate suggestions" });
    }
  });

  // Craft a message from a suggestion
  app.post("/api/craft-message", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const { suggestion, matchId } = req.body;
      
      // Get match's user data for personality traits
      const [match] = await db
        .select()
        .from(users)
        .where(eq(users.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      const craftedMessage = await craftMessageFromSuggestion(
        suggestion,
        req.user.personalityTraits || {},
        match.personalityTraits || {}
      );

      res.json({ message: craftedMessage });
    } catch (error) {
      console.error("Error crafting message:", error);
      res.status(500).json({ 
        message: "Failed to craft message",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get event suggestions
  app.post("/api/events/suggest", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const { matchId } = req.body;
      
      // Get match's user data
      const [match] = await db
        .select()
        .from(users)
        .where(eq(users.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      const suggestions = await generateEventSuggestions(
        req.user.personalityTraits || {},
        match.personalityTraits || {}
      );

      res.json({ suggestions });
    } catch (error) {
      console.error("Error generating event suggestions:", error);
      res.status(500).json({ 
        message: "Failed to generate event suggestions",
        suggestions: [
          "Visit a local art gallery or museum together",
          "Have coffee at a quiet café and chat",
          "Take a walking tour of the city"
        ]
      });
    }
  });

  // Get user details
  app.get("/api/users/:userId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
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
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });

  // Get single match - consolidated endpoint
  app.get("/api/matches/:matchId", requireAuth, async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
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
        return res.status(404).json({ message: "Match not found or unauthorized" });
      }

      // Format response
      const matchUser = matchWithUsers.matchUser;
      const matchTraits = matchUser.personalityTraits || {};
      const currentUserTraits = req.user!.personalityTraits || {};
      
      // Calculate compatibility score
      let compatibilityScore = 0;
      let traitCount = 0;
      for (const trait in currentUserTraits) {
        if (matchTraits[trait] !== undefined) {
          const similarity = 1 - Math.abs(currentUserTraits[trait] - matchTraits[trait]);
          compatibilityScore += similarity;
          traitCount++;
        }
      }

      const score = traitCount > 0 
        ? Math.round((compatibilityScore / traitCount) * 100)
        : matchWithUsers.match.score;

      return res.json({
        id: matchId,
        status: matchWithUsers.match.status,
        createdAt: matchWithUsers.match.createdAt,
        score: score,
        name: matchUser.name || matchUser.username,
        username: matchUser.username,
        personalityTraits: matchTraits,
        avatar: "/default-avatar.png"
      });
    } catch (error) {
      console.error("Error fetching match:", error);
      return res.status(500).json({ 
        message: "Failed to fetch match details",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get chat suggestions based on personality traits
  app.post("/api/chat/suggest", requireAuth, async (req, res) => {
    try {
      const { matchId } = req.body;
      if (!matchId) {
        return res.status(400).json({ message: "Match ID is required" });
      }

      // Type assertion since requireAuth ensures req.user exists
      const user = req.user as SelectUser;
      
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
        return res.status(404).json({ message: "Match not found or not accepted" });
      }

      const matchUser = matchWithUser.matchUser;
      const userTraits = user.personalityTraits || {};
      const matchTraits = matchUser.personalityTraits || {};

    // Generate suggestions based on personality traits
    try {
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

      res.json({ suggestions });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      res.status(500).json({ message: "Failed to generate suggestions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}