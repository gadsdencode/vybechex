import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.js";
import { db } from "@db";
import { matches, messages, users } from "@db/schema";
import { and, eq, ne, desc, or } from "drizzle-orm";
import { crypto } from "./auth.js";
import { generateConversationSuggestions, craftMessageFromSuggestion, generateEventSuggestions } from "./utils/openai";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

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

  // Get single match
  app.get("/api/matches/:matchId", async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }
      
      // Get match with user details and both users' information
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
          user1: {
            id: users.id,
            username: users.username,
            name: users.name,
            personalityTraits: users.personalityTraits
          }
        })
        .from(matches)
        .leftJoin(users, eq(matches.userId1, users.id))
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!matchWithUsers) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Get the other user's details
      const [otherUser] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          personalityTraits: users.personalityTraits
        })
        .from(users)
        .where(eq(users.id, matchWithUsers.match.userId2))
        .limit(1);

      // Check if user is part of match
      if (matchWithUsers.match.userId1 !== req.user.id && matchWithUsers.match.userId2 !== req.user.id) {
        return res.status(403).json({ message: "You are not a participant in this match" });
      }

      // Combine match data with both users' information
      const enrichedMatch = {
        ...matchWithUsers.match,
        user1: matchWithUsers.user1,
        user2: otherUser
      };

      return res.json(enrichedMatch);
    } catch (error) {
      console.error("Error fetching match:", error);
      return res.status(500).json({ 
        message: "Failed to fetch match",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Create a new match
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
        return res.status(400).json({ message: "Match already exists" });
      }

      // Create new match
      const [match] = await db
        .insert(matches)
        .values({
          userId1: req.user.id,
          userId2: userId2,
          score: score,
          status: 'pending'
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
      
      // Get match
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      // Verify user is part of match
      if (match.userId1 !== req.user.id && match.userId2 !== req.user.id) {
        return res.status(403).send("You are not a participant in this match");
      }

      // Update match status
      const [updatedMatch] = await db
        .update(matches)
        .set({ status })
        .where(eq(matches.id, matchId))
        .returning();

      res.json(updatedMatch);
    } catch (error) {
      console.error("Error updating match:", error);
      res.status(500).send("Failed to update match");
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

  // Get chat messages
  app.get("/api/messages/:matchId", async (req, res) => {
    // Ensure proper content type is always set
    res.setHeader('Content-Type', 'application/json');

    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ message: "Invalid match ID" });
      }
      
      // First check if match exists
      const [match] = await db
        .select({
          id: matches.id,
          status: matches.status,
          userId1: matches.userId1,
          userId2: matches.userId2
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Verify user is part of match
      if (match.userId1 !== req.user.id && match.userId2 !== req.user.id) {
        return res.status(403).json({ message: "You are not a participant in this match" });
      }

      // Check match status
      if (match.status !== 'accepted') {
        return res.status(403).json({ message: "Match must be accepted before messaging" });
      }

      const matchMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt));

      return res.json(matchMessages);
    } catch (error) {
      console.error("Error in /api/messages/:matchId:", error);
      return res.status(500).json({ 
        message: "Failed to fetch messages",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send message
  app.post("/api/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const { matchId, content } = req.body;
    if (!matchId || !content) {
      return res.status(400).send("Missing required fields");
    }
    
    try {
      // First get the match with full user details
      const [match] = await db
        .select({
          id: matches.id,
          status: matches.status,
          userId1: matches.userId1,
          userId2: matches.userId2,
          score: matches.score,
          createdAt: matches.createdAt
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        console.log("Match not found:", { matchId });
        return res.status(404).send("Match not found");
      }

      // Verify user is part of match
      if (match.userId1 !== req.user.id && match.userId2 !== req.user.id) {
        console.log("User not in match:", { 
          matchId, 
          userId: req.user.id,
          matchUsers: [match.userId1, match.userId2]
        });
        return res.status(403).send("You are not a participant in this match");
      }

      // Check match status
      if (match.status !== 'accepted') {
        console.log("Cannot send message - match not accepted:", {
          matchId,
          status: match.status
        });
        return res.status(403).send("Match must be accepted before messaging");
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

      // Return the new message with sender info
      const [messageWithSender] = await db
        .select({
          id: messages.id,
          matchId: messages.matchId,
          senderId: messages.senderId,
          content: messages.content,
          createdAt: messages.createdAt,
          analyzed: messages.analyzed,
          sentiment: messages.sentiment
        })
        .from(messages)
        .where(eq(messages.id, newMessage.id))
        .limit(1);

      res.json(messageWithSender);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).send("Failed to send message");
    }
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    
    try {
      const { matchId } = req.body;
      if (!matchId) {
        return res.status(400).json({ message: "Match ID is required" });
      }

      // First get the match
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Verify user is part of match
      if (match.userId1 !== req.user.id && match.userId2 !== req.user.id) {
        return res.status(403).json({ message: "You are not a participant in this match" });
      }

      // Get the other user's data
      const otherUserId = match.userId1 === req.user.id ? match.userId2 : match.userId1;
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
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      const suggestions = await generateConversationSuggestions(
        req.user.personalityTraits || {},
        otherUser.personalityTraits || {},
        recentMessages,
        req.user.id
      );

      res.json({ 
        suggestions: suggestions.map((text: string) => ({ 
          text,
          confidence: 1
        }))
      });
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

  const httpServer = createServer(app);
  return httpServer;
}