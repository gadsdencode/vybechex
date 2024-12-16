import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.js";
import { db } from "@db";
import { matches, messages, users, groups, groupMembers } from "@db/schema";
import { and, eq, ne, desc, sql, notInArray } from "drizzle-orm";
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

  // Group Management Endpoints
  app.post("/api/groups", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const { name, description, maxMembers } = req.body;
      
      // Create the group
      const [newGroup] = await db.insert(groups)
        .values({
          name,
          description,
          creatorId: req.user.id,
          maxMembers: maxMembers || 10,
        })
        .returning();

      // Add creator as first member with creator role
      await db.insert(groupMembers)
        .values({
          groupId: newGroup.id,
          userId: req.user.id,
          role: "creator"
        });

      // Update user's group creator status
      await db.update(users)
        .set({ isGroupCreator: true })
        .where(eq(users.id, req.user.id));

      res.json(newGroup);
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.get("/api/groups", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
      const allGroups = await db.select()
        .from(groups)
        .leftJoin(groupMembers, eq(groups.id, groupMembers.groupId))
        .where(eq(groups.isOpen, true));

      // Count members for each group
      const groupsWithCounts = await Promise.all(
        allGroups.map(async (group) => {
          const memberCount = await db
            .select({ count: sql`count(*)` })
            .from(groupMembers)
            .where(eq(groupMembers.groupId, group.groups.id));

          return {
            ...group.groups,
            memberCount: memberCount[0].count,
            isMember: group.group_members?.userId === req.user.id
          };
        })
      );

      res.json(groupsWithCounts);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/groups/:groupId/join", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const groupId = parseInt(req.params.groupId);
      
      // Check if group exists and is open
      const [group] = await db.select()
        .from(groups)
        .where(and(
          eq(groups.id, groupId),
          eq(groups.isOpen, true)
        ))
        .limit(1);

      if (!group) {
        return res.status(404).json({ message: "Group not found or not open for joining" });
      }

      // Check if user is already a member
      const [existingMember] = await db.select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, req.user.id)
        ))
        .limit(1);

      if (existingMember) {
        return res.status(400).json({ message: "Already a member of this group" });
      }

      // Check member count against max members
      const memberCount = await db
        .select({ count: sql`count(*)` })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));

      if (memberCount[0].count >= group.maxMembers) {
        return res.status(400).json({ message: "Group is full" });
      }

      // Add user as member
      await db.insert(groupMembers)
        .values({
          groupId,
          userId: req.user.id,
          role: "member"
        });

      res.json({ message: "Successfully joined group" });
    } catch (error) {
      console.error("Error joining group:", error);
      res.status(500).json({ message: "Failed to join group" });
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
        success: false,
        message: "Failed to craft message"
      });
    }
  // Get event suggestions for a match
  app.get("/api/event-suggestions/:matchId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    
    try {
      const matchId = parseInt(req.params.matchId);
      
      // Get the match data to find both users
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        return res.status(404).send("Match not found");
      }

      // Get both users' data
      const [otherUserId] = [match.userId1, match.userId2].filter(id => id !== req.user.id);
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) {
        return res.status(404).send("Matched user not found");
      }

      const suggestions = await generateEventSuggestions(
        req.user.personalityTraits || {},
        otherUser.personalityTraits || {}
      );

      res.json({ suggestions });
    } catch (error) {
      console.error("Error getting event suggestions:", error);
      res.status(500).json({ message: "Failed to get event suggestions" });
    }
  });

  });

  // Get potential group matches with compatibility scores
  app.get("/api/group-matches", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
      // Get groups where the user is a member
      const userGroups = await db.select()
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(eq(groupMembers.userId, req.user.id));

      if (userGroups.length === 0) {
        return res.json([]);
      }

      // Get all other groups
      const allGroups = await db.select()
        .from(groups)
        .where(
          and(
            eq(groups.isOpen, true),
            notInArray(
              groups.id,
              userGroups.map(g => g.groups.id)
            )
          )
        );

      // For each user group, calculate compatibility with other groups
      const matches = await Promise.all(
        userGroups.flatMap(async userGroup => {
          // Get all members of user's group
          const groupMembers = await db.select()
            .from(users)
            .innerJoin(
              groupMembers,
              and(
                eq(groupMembers.userId, users.id),
                eq(groupMembers.groupId, userGroup.groups.id)
              )
            )
            .where(eq(users.quizCompleted, true));

          // Calculate average personality traits for user's group
          const groupTraits = groupMembers.reduce((acc, member) => {
            const traits = member.users.personalityTraits || {};
            Object.entries(traits).forEach(([trait, value]) => {
              acc[trait] = (acc[trait] || 0) + value;
            });
            return acc;
          }, {} as Record<string, number>);

          // Normalize the traits by member count
          Object.keys(groupTraits).forEach(trait => {
            groupTraits[trait] /= groupMembers.length;
          });

          // Calculate compatibility with other groups
          return Promise.all(allGroups.map(async otherGroup => {
            // Get other group's members
            const otherGroupMembers = await db.select()
              .from(users)
              .innerJoin(
                groupMembers,
                and(
                  eq(groupMembers.userId, users.id),
                  eq(groupMembers.groupId, otherGroup.id)
                )
              )
              .where(eq(users.quizCompleted, true));

            // Calculate average traits for other group
            const otherGroupTraits = otherGroupMembers.reduce((acc, member) => {
              const traits = member.users.personalityTraits || {};
              Object.entries(traits).forEach(([trait, value]) => {
                acc[trait] = (acc[trait] || 0) + value;
              });
              return acc;
            }, {} as Record<string, number>);

            // Normalize the traits
            Object.keys(otherGroupTraits).forEach(trait => {
              otherGroupTraits[trait] /= otherGroupMembers.length;
            });

            // Calculate compatibility score
            let compatibilityScore = 0;
            let traitCount = 0;

            for (const trait in groupTraits) {
              if (otherGroupTraits[trait] !== undefined) {
                const similarity = 1 - Math.abs(groupTraits[trait] - otherGroupTraits[trait]);
                compatibilityScore += similarity;
                traitCount++;
              }
            }

            const score = traitCount > 0
              ? Math.round((compatibilityScore / traitCount) * 100)
              : 0;

            return {
              userGroup: userGroup.groups,
              matchedGroup: otherGroup,
              compatibilityScore: score,
              memberCount: otherGroupMembers.length
            };
          }));
        })
      );

      // Flatten and sort by compatibility score
      const flattenedMatches = matches
        .flat()
        .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      res.json(flattenedMatches);
    } catch (error) {
      console.error("Error getting group matches:", error);
      res.status(500).json({ message: "Failed to get group matches" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}