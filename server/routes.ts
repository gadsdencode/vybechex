import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.js";
import { db } from "@db";
import { matches, messages, users } from "@db/schema";
import { and, eq, ne, desc } from "drizzle-orm";
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
      .where(and(
        ne(users.id, req.user.id),
        eq(users.quizCompleted, true)
      ));

    // Calculate compatibility scores
    const currentUserTraits = req.user.personalityTraits || {};
    const matchesWithScores = potentialMatches.map(match => {
      const matchTraits = match.personalityTraits || {};
      let compatibilityScore = 0;
      let traitCount = 0;

      // Compare each personality trait
      for (const trait in currentUserTraits) {
        if (matchTraits[trait] !== undefined) {
          // Calculate similarity (1 - absolute difference)
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
        ...match,
        compatibilityScore: score
      };
    });

    // Sort by compatibility score (highest first)
    const sortedMatches = matchesWithScores.sort((a, b) => 
      b.compatibilityScore - a.compatibilityScore
    );

    res.json(sortedMatches);
  });

  // Get chat messages
  app.get("/api/messages/:matchId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const matchId = parseInt(req.params.matchId);
      
      // Verify the match exists and user is part of it
      const [match] = await db
        .select()
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

      if (!match) {
        return res.status(404).send("Match not found or you're not part of this match");
      }

      const matchMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt));

      res.json(matchMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).send("Failed to fetch messages");
    }
  });

  // Send message
  app.post("/api/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const { matchId, content } = req.body;
    
    try {
      // Verify the match exists and user is part of it
      const [match] = await db
        .select()
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

      if (!match) {
        return res.status(404).send("Match not found or you're not part of this match");
      }

      const [newMessage] = await db.insert(messages)
        .values({
          matchId,
          senderId: req.user.id,
          content: content.trim(),
          createdAt: new Date()
        })
        .returning();

      res.json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).send("Failed to send message");
    }
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", async (req, res) => {
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

      // Get recent chat history
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.matchId, matchId))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      const suggestions = await generateConversationSuggestions(
        req.user.personalityTraits || {},
        match.personalityTraits || {},
        recentMessages,
        req.user.id
      );

      res.json({ suggestions });
    } catch (error) {
      console.error("Error generating suggestions:", error);
      res.status(500).json({ 
        message: "Failed to generate suggestions",
        suggestions: [
          "Tell me more about your interests!",
          "What do you like to do for fun?",
          "Have you traveled anywhere interesting lately?"
        ]
      });
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