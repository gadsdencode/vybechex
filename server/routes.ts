import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { matches, messages, users, groups, groupMembers, matchesRelations } from "@db/schema";
import { and, eq, ne, desc, sql, notInArray } from "drizzle-orm";
import { setupAuth } from "./auth";
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
          }
        ];

        for (const testUser of testUsers) {
          const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.username, testUser.username))
            .limit(1);

          if (!existingUser) {
            await db.insert(users).values({
              username: testUser.username,
              password: await crypto.hash('testpass123'),
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
    
    try {
      const [updatedUser] = await db.update(users)
        .set({ 
          personalityTraits: traits, 
          quizCompleted: true 
        })
        .where(eq(users.id, req.user.id))
        .returning();

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

  // Group Management Endpoints
  app.post("/api/groups", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const { name, description, maxMembers } = req.body;
      
      const [newGroup] = await db.insert(groups)
        .values({
          name,
          description,
          creatorId: req.user.id,
          maxMembers: maxMembers || 10,
        })
        .returning();

      await db.insert(groupMembers)
        .values({
          groupId: newGroup.id,
          userId: req.user.id,
          role: "creator"
        });

      await db.update(users)
        .set({ isGroupCreator: true })
        .where(eq(users.id, req.user.id));

      res.json(newGroup);
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  // Get chat messages
  app.get("/api/messages/:matchId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const matchMessages = await db.select()
      .from(messages)
      .where(eq(messages.matchId, parseInt(req.params.matchId)))
      .orderBy(desc(messages.createdAt));

    res.json(matchMessages);
  });

  // Send message
  app.post("/api/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const { matchId, content } = req.body;
    const [newMessage] = await db.insert(messages)
      .values({
        matchId,
        senderId: req.user.id,
        content
      })
      .returning();

    res.json(newMessage);
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const { matchId } = req.body;
      
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      const otherUserId = match.userId1 === req.user.id ? match.userId2 : match.userId1;
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).send("Matched user not found");
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
      
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      const otherUserId = match.userId1 === req.user.id ? match.userId2 : match.userId1;
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).send("Match not found");
      }

      const craftedMessage = await craftMessageFromSuggestion(
        suggestion,
        req.user.personalityTraits || {},
        otherUser.personalityTraits || {}
      );

      res.json({ message: craftedMessage });
    } catch (error) {
      console.error("Error crafting message:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to craft message"
      });
    }
  });

  // Get event suggestions for a match
  app.get("/api/event-suggestions/:matchId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const matchId = parseInt(req.params.matchId);
      
      // Get both users from the match
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      const otherUserId = match.userId1 === req.user.id ? match.userId2 : match.userId1;
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).send("Match not found");
      }

      // Use existing traits or fallback to test data
      const userTraits = req.user.personalityTraits || {
        extraversion: 0.7,
        communication: 0.8,
        openness: 0.6,
        values: 0.5
      };
      
      const otherUserTraits = otherUser.personalityTraits || {
        extraversion: 0.6,
        communication: 0.7,
        openness: 0.8,
        values: 0.6
      };

      // Generate event suggestions and ensure they have the required format
      const suggestions = await generateEventSuggestions(
        userTraits,
        otherUserTraits
      );

      // Provide fallback suggestions if the API fails or returns empty
      const fallbackSuggestions = [
        {
          title: "Coffee Chat",
          description: "Meet at a local café for a relaxed conversation over coffee or tea.",
          compatibility: 85
        },
        {
          title: "Nature Walk",
          description: "Take a refreshing walk in a nearby park or nature trail.",
          compatibility: 80
        },
        {
          title: "Board Game Café",
          description: "Visit a board game café and enjoy some friendly competition.",
          compatibility: 75
        }
      ];

      res.json({ 
        suggestions: suggestions.length > 0 ? suggestions : fallbackSuggestions 
      });
    } catch (error) {
      console.error("Error getting event suggestions:", error);
      res.status(500).json({ 
        message: "Failed to get event suggestions",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get potential matches with compatibility scores
  app.get("/api/matches", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
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
    } catch (error) {
      console.error("Error getting matches:", error);
      res.status(500).json({ 
        message: "Failed to get matches",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}