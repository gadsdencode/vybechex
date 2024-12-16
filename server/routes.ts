import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.js";
import { db } from "@db";
import { matches, messages, users } from "@db/schema";
import { and, eq, ne, desc } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Quiz submission
  app.post("/api/quiz", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    const { traits } = req.body;
    
    await db.update(users)
      .set({ personalityTraits: traits, quizCompleted: true })
      .where(eq(users.id, req.user.id));

    res.json({ success: true });
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
    const newMessage = await db.insert(messages)
      .values({
        matchId,
        senderId: req.user.id,
        content
      })
      .returning();

    res.json(newMessage[0]);
  });

  // Get AI conversation suggestions
  app.post("/api/suggest", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    const { context } = req.body;
    // Simulated AI response for now
    const suggestions = [
      "Tell me more about your interests!",
      "What do you like to do for fun?",
      "Have you traveled anywhere interesting lately?"
    ];

    res.json({ suggestions });
  });

  const httpServer = createServer(app);
  return httpServer;
}
