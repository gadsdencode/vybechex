// server/controllers/messageController.ts
// Message-related route handlers

import type { Request, Response, NextFunction } from 'express';
import { db } from '@db';
import { messages, matches, users } from '@db/schema';
import { eq, desc } from 'drizzle-orm';
import { getMatchById } from '../utils/userQueries';
import { isAuthenticated } from './shared';

// Get match messages
export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.params.matchId);

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

    const matchMessages = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
        sender: {
          id: users.id,
          username: users.username,
          name: users.name,
          avatar: users.avatar
        }
      })
      .from(messages)
      .where(eq(messages.matchId, matchId))
      .leftJoin(users, eq(messages.senderId, users.id))
      .orderBy(desc(messages.createdAt));

    res.json({ success: true, messages: matchMessages });
  } catch (error) {
    console.error('Error getting match messages:', error);
    next(error);
  }
}

// Send a message in a match
export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const matchId = parseInt(req.params.matchId);
    const { content } = req.body;

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. Please provide a valid positive number.'
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const match = await getMatchById(matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const [newMessage] = await db
      .insert(messages)
      .values({
        matchId,
        senderId: userId,
        content: content.trim(),
        createdAt: new Date(),
        analyzed: false
      })
      .returning();

    if (!newMessage) {
      throw new Error('Failed to create message');
    }

    // Update match last activity
    await db
      .update(matches)
      .set({ lastActivityAt: new Date() })
      .where(eq(matches.id, matchId));

    // Get sender details
    const [sender] = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        avatar: users.avatar
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({
      success: true,
      message: { ...newMessage, sender }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    next(error);
  }
}
