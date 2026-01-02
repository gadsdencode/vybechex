// server/utils/userQueries.ts
// Batch query utilities to solve N+1 query problems

import { db } from '@db';
import { users, userInterests, interests } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

type InterestCategory = 'value' | 'personality' | 'hobby';

export interface Interest {
  id: number;
  name: string;
  score: number;
  category: InterestCategory;
}

export interface UserWithInterests {
  id: number;
  username?: string;
  name?: string;
  bio?: string;
  avatar?: string;
  quizCompleted: boolean;
  personalityTraits: Record<string, number>;
  interests: Interest[];
}

interface UserInterestResult {
  id: number;
  userId: number;
  score: number;
  interest: {
    id: number;
    name: string;
    categoryId: number;
  } | null;
}

// Helper function to get category from categoryId
function getCategoryFromId(categoryId: number): InterestCategory {
  switch (categoryId) {
    case 1:
      return 'value';
    case 2:
      return 'personality';
    case 3:
      return 'hobby';
    default:
      return 'personality';
  }
}

/**
 * Get a single user with their interests
 * Use this for single-user lookups
 */
export async function getUserWithInterests(userId: number): Promise<UserWithInterests | null> {
  if (!userId || isNaN(userId) || userId <= 0) {
    console.log('Invalid user ID:', userId);
    return null;
  }

  const result = await getUsersWithInterests([userId]);
  return result.get(userId) || null;
}

/**
 * Batch fetch multiple users with their interests in just 2 queries
 * This solves the N+1 query problem by using IN clauses
 * 
 * @param userIds - Array of user IDs to fetch
 * @returns Map of userId to UserWithInterests
 */
export async function getUsersWithInterests(userIds: number[]): Promise<Map<number, UserWithInterests>> {
  const resultMap = new Map<number, UserWithInterests>();
  
  // Filter out invalid IDs
  const validIds = userIds.filter(id => id && !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    return resultMap;
  }

  try {
    // Single query for all users
    const usersData = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        personalityTraits: users.personalityTraits,
        bio: users.bio,
        avatar: users.avatar,
        quizCompleted: users.quizCompleted
      })
      .from(users)
      .where(inArray(users.id, validIds));

    // Single query for all user interests
    const allInterests = await db
      .select({
        id: userInterests.id,
        userId: userInterests.userId,
        score: userInterests.score,
        interest: {
          id: interests.id,
          name: interests.name,
          categoryId: interests.categoryId
        }
      })
      .from(userInterests)
      .where(inArray(userInterests.userId, validIds))
      .leftJoin(interests, eq(interests.id, userInterests.interestId));

    // Group interests by userId in memory
    const interestsByUserId = new Map<number, Interest[]>();
    
    for (const row of allInterests) {
      if (row.interest && row.interest.name && typeof row.interest.categoryId === 'number') {
        const interest: Interest = {
          id: row.id,
          name: row.interest.name,
          score: row.score,
          category: getCategoryFromId(row.interest.categoryId)
        };
        
        const existing = interestsByUserId.get(row.userId) || [];
        existing.push(interest);
        interestsByUserId.set(row.userId, existing);
      }
    }

    // Build the result map
    for (const user of usersData) {
      const personalityTraits = (user.personalityTraits && typeof user.personalityTraits === 'object')
        ? user.personalityTraits as Record<string, number>
        : {};

      resultMap.set(user.id, {
        id: user.id,
        username: user.username || '',
        name: user.name || '',
        bio: user.bio || '',
        avatar: user.avatar || '/default-avatar.png',
        quizCompleted: user.quizCompleted,
        personalityTraits,
        interests: interestsByUserId.get(user.id) || []
      });
    }

    return resultMap;
  } catch (error) {
    console.error('Error in getUsersWithInterests batch query:', error);
    throw new Error('Failed to get user details');
  }
}

/**
 * Get match data by ID
 */
export async function getMatchById(matchId: number) {
  const { matches } = await import('@db/schema');
  
  const [match] = await db
    .select({
      id: matches.id,
      status: matches.status,
      user1Id: matches.userId1,
      user2Id: matches.userId2,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  return match;
}
