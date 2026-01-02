// server/controllers/userController.ts
// User-related route handlers (profile, quiz, achievements)

import type { Request, Response, NextFunction } from 'express';
import { db } from '@db';
import { users, achievements, userAchievements, profileProgress } from '@db/schema';
import { eq, sql } from 'drizzle-orm';
import { isAuthenticated, calculateLevel } from './shared';

// Submit quiz results
export async function submitQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { traits } = req.body;

    if (!traits || typeof traits !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid quiz data format'
      });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        personalityTraits: traits,
        quizCompleted: true,
        createdAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error('Failed to update user data');
    }

    res.json({
      success: true,
      message: 'Quiz completed successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error in quiz submission:', error);
    next(error);
  }
}

// Update user profile
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { name, bio } = req.body;

    const [updatedUser] = await db
      .update(users)
      .set({ name: name || '', bio: bio || '' })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error('Failed to update user profile');
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    next(error);
  }
}

// Get achievements and progress
export async function getAchievements(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;

    const allAchievements = await db.select().from(achievements);

    const unlockedAchievements = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));

    const [userProgress] = await db
      .select()
      .from(profileProgress)
      .where(eq(profileProgress.userId, userId))
      .limit(1);

    if (!userProgress) {
      const [newProgress] = await db
        .insert(profileProgress)
        .values({
          userId,
          sections: {
            basicInfo: false,
            avatar: false,
            interests: false,
            quiz: false,
            bio: false,
            connections: false
          } as const,
          totalPoints: 0,
          level: 1,
          lastUpdated: new Date()
        })
        .returning();

      return res.json({
        achievements: allAchievements,
        userAchievements: [],
        progress: newProgress
      });
    }

    res.json({
      achievements: allAchievements,
      userAchievements: unlockedAchievements,
      progress: userProgress
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    next(error);
  }
}

// Update profile progress
export async function updateProfileProgress(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { section, completed } = req.body;

    if (!section || typeof completed !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body'
      });
    }

    const [currentProgress] = await db
      .select()
      .from(profileProgress)
      .where(eq(profileProgress.userId, userId))
      .limit(1);

    if (!currentProgress) {
      return res.status(404).json({
        success: false,
        message: 'Progress record not found'
      });
    }

    const updatedSections = {
      ...currentProgress.sections,
      [section]: completed
    };

    const potentialAchievements = await db
      .select()
      .from(achievements)
      .where(sql`criteria->>'condition' = ${section}`);

    const unlockedAchievementIds = (await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId)))
      .map(ua => ua.achievementId);

    const newAchievements = potentialAchievements.filter(achievement => 
      completed && !unlockedAchievementIds.includes(achievement.id)
    );

    const additionalPoints = newAchievements.reduce((sum, a) => sum + a.points, 0);
    const newTotalPoints = currentProgress.totalPoints + additionalPoints;
    const newLevel = calculateLevel(newTotalPoints);
    const leveledUp = newLevel > currentProgress.level;

    await db.transaction(async (tx) => {
      await tx
        .update(profileProgress)
        .set({
          sections: updatedSections,
          totalPoints: newTotalPoints,
          level: newLevel,
          lastUpdated: new Date()
        })
        .where(eq(profileProgress.userId, userId));

      if (newAchievements.length > 0) {
        await tx
          .insert(userAchievements)
          .values(
            newAchievements.map(achievement => ({
              userId,
              achievementId: achievement.id,
              unlockedAt: new Date()
            }))
          );
      }
    });

    res.json({
      success: true,
      newAchievements,
      levelUp: leveledUp,
      newLevel: newLevel
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    next(error);
  }
}
