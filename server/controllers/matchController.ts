// server/controllers/matchController.ts
// Match-related route handlers

import type { Request, Response, NextFunction } from 'express';
import { db } from '@db';
import { matches, users } from '@db/schema';
import { sql, and, eq, or, desc } from 'drizzle-orm';
import { getUserWithInterests, getUsersWithInterests, getMatchById } from '../utils/userQueries';
import { generateEnhancedChatSuggestions, generateEventSuggestions, craftPersonalizedMessage, generateEventConversationStarter } from '../utils/suggestions';
import { isAuthenticated, calculateCompatibilityScore } from './shared';

// Get chat suggestions for a match
export async function getChatSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.body.matchId as string);

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. Please provide a valid positive number.'
      });
    }

    const match = await getMatchById(matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const [currentUser, matchedUser] = await Promise.all([
      getUserWithInterests(userId),
      getUserWithInterests(matchedUserId)
    ]);

    if (!currentUser || !matchedUser) {
      return res.status(404).json({ success: false, message: 'User details not found' });
    }

    const suggestions = generateEnhancedChatSuggestions(
      currentUser.personalityTraits,
      matchedUser.personalityTraits,
      currentUser.interests,
      matchedUser.interests
    );

    res.json({
      success: true,
      suggestions: suggestions.map(s => ({ text: s.text, confidence: s.confidence }))
    });
  } catch (error) {
    console.error('Error getting chat suggestions:', error);
    next(error);
  }
}

// Get event suggestions for a match
export async function getEventSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.body.matchId as string);

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. Please provide a valid positive number.'
      });
    }

    const match = await getMatchById(matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const [currentUser, matchedUser] = await Promise.all([
      getUserWithInterests(userId),
      getUserWithInterests(matchedUserId)
    ]);

    if (!currentUser || !matchedUser) {
      return res.status(404).json({ success: false, message: 'User details not found' });
    }

    const suggestions = await generateEventSuggestions(
      currentUser.personalityTraits,
      matchedUser.personalityTraits,
      currentUser.interests,
      matchedUser.interests
    );

    res.json({
      success: true,
      suggestions: suggestions.map(s => ({
        title: s.title,
        description: s.description,
        reasoning: s.reasoning
      }))
    });
  } catch (error) {
    console.error('Error getting event suggestions:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate event suggestions',
      suggestions: []
    });
  }
}

// Craft a personalized message
export async function craftMessage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { matchId, suggestion, eventDetails } = req.body;

    if (!suggestion || typeof suggestion !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid suggestion text' });
    }

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid match ID' });
    }

    const match = await getMatchById(matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const [currentUser, matchedUser] = await Promise.all([
      getUserWithInterests(userId),
      getUserWithInterests(matchedUserId)
    ]);

    if (!currentUser || !matchedUser) {
      return res.status(404).json({ success: false, message: 'User details not found' });
    }

    let message: string;
    if (eventDetails) {
      message = await generateEventConversationStarter(
        eventDetails,
        currentUser.personalityTraits,
        matchedUser.personalityTraits
      );
    } else {
      message = craftPersonalizedMessage(
        suggestion,
        currentUser.personalityTraits,
        matchedUser.personalityTraits
      );
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Error crafting message:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to craft message'
    });
  }
}

// Create a new match
export async function createMatch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { targetUserId } = req.body;

    console.log('Creating match:', { userId, targetUserId });

    if (!targetUserId || isNaN(Number(targetUserId)) || Number(targetUserId) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target user ID. Please provide a valid positive number.'
      });
    }

    if (userId === Number(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create a match with yourself'
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      getUserWithInterests(userId),
      getUserWithInterests(Number(targetUserId))
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ success: false, message: 'One or both users not found' });
    }

    if (!currentUser.quizCompleted || !targetUser.quizCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Both users must complete their personality quizzes before matching'
      });
    }

    if (!currentUser.personalityTraits || !targetUser.personalityTraits || 
        Object.keys(currentUser.personalityTraits).length === 0 || 
        Object.keys(targetUser.personalityTraits).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Both users must have personality traits data'
      });
    }

    const existingMatch = await db
      .select()
      .from(matches)
      .where(
        or(
          and(eq(matches.userId1, userId), eq(matches.userId2, Number(targetUserId))),
          and(eq(matches.userId1, Number(targetUserId)), eq(matches.userId2, userId))
        )
      )
      .limit(1);

    if (existingMatch.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Match already exists between these users'
      });
    }

    const compatibilityScore = calculateCompatibilityScore(
      currentUser.personalityTraits,
      targetUser.personalityTraits
    );
    const matchScore = Math.max(0, Math.min(100, Math.round(compatibilityScore * 100)));

    const [newMatch] = await db
      .insert(matches)
      .values({
        userId1: userId,
        userId2: Number(targetUserId),
        status: 'requested',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        score: matchScore
      })
      .returning();

    if (!newMatch) {
      throw new Error('Failed to create match record');
    }

    res.json({
      success: true,
      message: 'Match request sent successfully',
      match: {
        id: newMatch.id,
        status: newMatch.status,
        createdAt: newMatch.createdAt,
        lastActivityAt: newMatch.lastActivityAt,
        score: newMatch.score,
        user: targetUser
      }
    });
  } catch (error) {
    console.error('Error creating match:', error);
    next(error);
  }
}

// Get potential matches
export async function getPotentialMatches(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    console.log('Fetching potential matches for user:', userId);

    const [user] = await db
      .select({ quizCompleted: users.quizCompleted, personalityTraits: users.personalityTraits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.quizCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your personality quiz before viewing potential matches'
      });
    }

    const existingMatches = await db
      .select({
        otherUserId: sql<number>`CASE WHEN "user_id_1" = ${userId} THEN "user_id_2" ELSE "user_id_1" END`
      })
      .from(matches)
      .where(or(eq(matches.userId1, userId), eq(matches.userId2, userId)));

    const existingMatchIds = existingMatches.map(m => m.otherUserId);

    const potentialUsers = await db.execute<{
      id: number;
      username: string;
      name: string;
      bio: string;
      personalityTraits: Record<string, number>;
      avatar: string;
      quizCompleted: boolean;
    }>(sql`
      SELECT id, username, name, bio, personality_traits as "personalityTraits", avatar, quiz_completed as "quizCompleted"
      FROM users
      WHERE id != ${userId} AND quiz_completed = true
      ${existingMatchIds.length > 0 
        ? sql`AND id NOT IN (${sql.join(existingMatchIds.map(id => sql`${id}`), sql`, `)})`
        : sql``}
      LIMIT 10
    `);

    const potentialMatches = potentialUsers.rows.map(potentialUser => {
      const userTraits = user.personalityTraits as Record<string, number>;
      const matchTraits = potentialUser.personalityTraits as Record<string, number>;
      const compatibilityScore = calculateCompatibilityScore(userTraits, matchTraits);
      return { ...potentialUser, compatibilityScore };
    }).sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.json({ success: true, matches: potentialMatches });
  } catch (error) {
    console.error('Error fetching potential matches:', error);
    next(error);
  }
}

// Get match by ID
export async function getMatch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.params.id);

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. Please provide a valid positive number.'
      });
    }

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, matchId), or(eq(matches.userId1, userId), eq(matches.userId2, userId))))
      .limit(1);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const matchedUserId = match.userId1 === userId ? match.userId2 : match.userId1;
    const matchedUser = await getUserWithInterests(matchedUserId);

    if (!matchedUser) {
      return res.status(404).json({ success: false, message: 'Matched user not found' });
    }

    res.json({
      success: true,
      data: {
        id: match.id,
        status: match.status,
        createdAt: match.createdAt,
        lastActivityAt: match.lastActivityAt,
        score: match.score,
        user: matchedUser
      }
    });
  } catch (error) {
    console.error('Error getting match:', error);
    next(error);
  }
}

// Respond to a match request (accept/reject)
export async function respondToMatch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. Please provide a valid positive number.'
      });
    }

    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be either "accepted" or "rejected".'
      });
    }

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, matchId), or(eq(matches.userId1, userId), eq(matches.userId2, userId))))
      .limit(1);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    if (match.status !== 'requested') {
      return res.status(400).json({
        success: false,
        message: 'Can only respond to requested match requests'
      });
    }

    const [updatedMatch] = await db
      .update(matches)
      .set({ status: status as 'accepted' | 'rejected', lastActivityAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();

    if (!updatedMatch) {
      throw new Error('Failed to update match status');
    }

    const matchedUserId = match.userId1 === userId ? match.userId2 : match.userId1;
    const matchedUser = await getUserWithInterests(matchedUserId);

    if (!matchedUser) {
      return res.status(404).json({ success: false, message: 'Matched user not found' });
    }

    res.json({
      success: true,
      message: `Match ${status}`,
      match: { ...updatedMatch, user: matchedUser }
    });
  } catch (error) {
    console.error('Error responding to match:', error);
    next(error);
  }
}

// Get all matches for a user
export async function getAllMatches(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;

    const userMatches = await db
      .select({
        id: matches.id,
        status: matches.status,
        user1Id: matches.userId1,
        user2Id: matches.userId2,
        createdAt: matches.createdAt,
        lastActivityAt: matches.lastActivityAt,
        score: matches.score
      })
      .from(matches)
      .where(or(eq(matches.userId1, userId), eq(matches.userId2, userId)))
      .orderBy(desc(matches.lastActivityAt));

    const userIds = Array.from(new Set(
      userMatches.map(m => m.user1Id === userId ? m.user2Id : m.user1Id)
    ));

    const userMap = await getUsersWithInterests(userIds);

    const formattedMatches = userMatches.map(match => {
      const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const otherUser = userMap.get(otherUserId);
      if (!otherUser) return null;

      return {
        id: match.id,
        status: match.status,
        createdAt: match.createdAt,
        lastActivityAt: match.lastActivityAt,
        score: match.score,
        username: otherUser.username,
        name: otherUser.name,
        avatar: otherUser.avatar,
        personalityTraits: otherUser.personalityTraits,
        interests: otherUser.interests,
        user: {
          id: otherUserId,
          personalityTraits: otherUser.personalityTraits,
          interests: otherUser.interests
        }
      };
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    const groupedMatches = {
      accepted: formattedMatches.filter(m => m.status === 'accepted'),
      pending: formattedMatches.filter(m => m.status === 'pending'),
      requested: formattedMatches.filter(m => m.status === 'requested'),
      rejected: formattedMatches.filter(m => m.status === 'rejected'),
      potential: formattedMatches.filter(m => m.status === 'potential')
    };

    res.json({
      success: true,
      matches: groupedMatches,
      totalMatches: formattedMatches.length,
      acceptedMatches: groupedMatches.accepted.length,
      potentialMatches: groupedMatches.potential.length,
      requests: groupedMatches.requested.length + groupedMatches.pending.length
    });
  } catch (error) {
    console.error('Error getting matches:', error);
    next(error);
  }
}
