import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import cors from 'cors';
import { db } from '@db';
import type { Request, Response, NextFunction } from 'express';
import type { SelectUser } from '@db/schema';
import { sql } from 'drizzle-orm';
import { and, eq, or, desc } from 'drizzle-orm';
import multer, { FileFilterCallback } from 'multer';
import { Client } from '@replit/object-storage';
import { randomUUID } from 'crypto';
import { 
  interestCategories, 
  interests, 
  matches, 
  users,
  profileProgress,
  userInterests,
  messages,
  type UserInterest,
  type Interest as DBInterest,
  type InterestCategory as DBInterestCategory,
  type User,
  type Match,
  type Message,
  achievements,
  userAchievements,
  type Achievement,
  type UserAchievement,
  type ProfileProgress 
} from '@db/schema';
import { generateEnhancedChatSuggestions, generateEventSuggestions, craftPersonalizedMessage, generateEventConversationStarter } from './utils/suggestions';
import { validateUser } from './middleware/auth';
import path from 'path';

type MatchStatus = 'none' | 'requested' | 'pending' | 'accepted' | 'rejected' | 'potential';
type InterestCategory = 'value' | 'personality' | 'hobby';

interface Interest {
  id: number;
  name: string;
  score: number;
  category: InterestCategory;
}

interface AuthenticatedRequest extends Request {
  user: SelectUser;
}

interface UserWithInterests {
  id: number;
  username?: string;
  name?: string;
  bio?: string;
  avatar?: string;
  quizCompleted: boolean;
  personalityTraits: Record<string, number>;
  interests: Interest[];
}

interface FormattedMatch {
  id: number;
  status: MatchStatus;
  createdAt: Date;
  lastActivityAt: Date;
  username: string;
  name: string;
  bio: string;
  avatar: string;
  quizCompleted: boolean;
  personalityTraits: Record<string, number>;
  interests: Interest[];
  user: {
    id: number;
    personalityTraits: Record<string, number>;
    interests: Interest[];
  };
}

interface PersonalityTraits {
  extraversion: number;
  communication: number;
  openness: number;
  values: number;
  planning: number;
  sociability: number;
}

interface UserInterestResult {
  id: number;
  score: number;
  interest: {
    id: number;
    name: string;
    categoryId: number;
  } | null;
}

// Extend Request type to include file from multer
interface AuthenticatedFileRequest extends Request {
  user: SelectUser;
  file?: Express.Multer.File;
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

// Helper function to get user data with interests
async function getUserWithInterests(userId: number): Promise<UserWithInterests | null> {
  try {
    console.log('Getting user with interests:', userId);

    if (!userId || isNaN(userId) || userId <= 0) {
      console.log('Invalid user ID:', userId);
      return null;
    }

    const [user] = await db
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
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.log('User not found:', userId);
      return null;
    }

    if (!user.personalityTraits || typeof user.personalityTraits !== 'object') {
      console.log('Invalid personality traits for user:', userId);
      user.personalityTraits = {};
    }

    console.log('Found user:', user);

    // Get user interests from the junction table
    const userInterestResults = await db
      .select({
        id: userInterests.id,
        score: userInterests.score,
        interest: {
          id: interests.id,
          name: interests.name,
          categoryId: interests.categoryId
        }
      })
      .from(userInterests)
      .where(eq(userInterests.userId, userId))
      .leftJoin(interests, eq(interests.id, userInterests.interestId));

    console.log('Found user interests:', userInterestResults);

    // Transform interests into the expected format
    const formattedInterests: Interest[] = userInterestResults
      .filter((ui): ui is (UserInterestResult & { interest: NonNullable<UserInterestResult['interest']> }) => 
        ui !== null && 
        ui.interest !== null && 
        typeof ui.interest.name === 'string' &&
        typeof ui.interest.categoryId === 'number'
      )
      .map((ui) => ({
        id: ui.id,
        name: ui.interest.name,
        score: ui.score,
        category: getCategoryFromId(ui.interest.categoryId)
      }));

    return {
      id: user.id,
      username: user.username || '',
      name: user.name || '',
      bio: user.bio || '',
      avatar: user.avatar || '/default-avatar.png',
      quizCompleted: user.quizCompleted,
      personalityTraits: user.personalityTraits as Record<string, number>,
      interests: formattedInterests
    };
  } catch (error) {
    console.error('Error getting user with interests:', error);
    throw new Error('Failed to get user details');
  }
}

// Helper function to get match data
async function getMatchById(matchId: number) {
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

// Type guard to ensure request is authenticated
function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return req.user !== undefined && 'id' in req.user;
}

// Middleware to ensure request is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Error handler middleware
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('API Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// Helper function to calculate compatibility score
function calculateCompatibilityScore(
  userTraits: Partial<PersonalityTraits>,
  matchTraits: Partial<PersonalityTraits>
): number {
  const requiredTraits = [
    'extraversion',
    'communication',
    'openness',
    'values',
    'planning',
    'sociability'
  ] as const;

  let score = 0;
  let count = 0;

  // Validate and normalize traits
  const normalizedUserTraits: Record<string, number> = {};
  const normalizedMatchTraits: Record<string, number> = {};

  for (const trait of requiredTraits) {
    const userValue = userTraits[trait];
    const matchValue = matchTraits[trait];

    // Skip if either value is missing or invalid
    if (typeof userValue !== 'number' || typeof matchValue !== 'number' ||
        isNaN(userValue) || isNaN(matchValue)) {
      continue;
    }

    // Normalize values to be between 0 and 1
    normalizedUserTraits[trait] = Math.max(0, Math.min(1, userValue));
    normalizedMatchTraits[trait] = Math.max(0, Math.min(1, matchValue));

    // Calculate similarity (1 - absolute difference)
    const similarity = 1 - Math.abs(normalizedUserTraits[trait] - normalizedMatchTraits[trait]);
    score += similarity;
    count++;
  }

  // Return average similarity score, defaulting to 0 if no valid traits
  return count > 0 ? score / count : 0;
}

// Add interfaces for suggestion types
interface ChatSuggestion {
  text: string;
  confidence: number;
}

interface EventSuggestion {
  title: string;
  description: string;
  reasoning: string;
  date?: string;
  location?: string;
}

interface SuggestionContext {
  personalityTraits: Record<string, number>;
  interests: Interest[];
  sharedInterests?: string[];
  compatibilityScore?: number;
}

// Helper function to calculate user level based on points
function calculateLevel(points: number): number {
  return Math.floor(points / 1000) + 1;
}

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Enable CORS
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // Add health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only image files are allowed'));
        return;
      }
      cb(null, true);
    }
  });

  // Initialize Replit Object Storage client
  const storage = new Client();

  // Get chat suggestions for a match
  app.post('/api/matches/suggestions', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const matchId = parseInt(req.body.matchId as string);

      if (isNaN(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid match ID. Please provide a valid positive number.'
        });
      }

      // Verify match exists and user is part of it
      const match = await getMatchById(matchId);
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Get matched user details
      const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const [currentUser, matchedUser] = await Promise.all([
        getUserWithInterests(userId),
        getUserWithInterests(matchedUserId)
      ]);

      if (!currentUser || !matchedUser) {
        return res.status(404).json({
          success: false,
          message: 'User details not found'
        });
      }

      // Generate chat suggestions based on user profiles
      const suggestions = generateEnhancedChatSuggestions(
        currentUser.personalityTraits,
        matchedUser.personalityTraits,
        currentUser.interests,
        matchedUser.interests
      );

      res.json({
        success: true,
        suggestions: suggestions.map(suggestion => ({
          text: suggestion.text,
          confidence: suggestion.confidence
        }))
      });
    } catch (error) {
      console.error('Error getting chat suggestions:', error);
      next(error);
    }
  });

  // Get event suggestions for a match
  app.post('/api/matches/suggestions/events', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const matchId = parseInt(req.body.matchId as string);

      if (isNaN(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid match ID. Please provide a valid positive number.'
        });
      }

      // Verify match exists and user is part of it
      const match = await getMatchById(matchId);
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Get matched user details
      const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const [currentUser, matchedUser] = await Promise.all([
        getUserWithInterests(userId),
        getUserWithInterests(matchedUserId)
      ]);

      if (!currentUser || !matchedUser) {
        return res.status(404).json({
          success: false,
          message: 'User details not found'
        });
      }

      // Generate event suggestions based on user profiles
      const suggestions = await generateEventSuggestions(
        currentUser.personalityTraits,
        matchedUser.personalityTraits,
        currentUser.interests,
        matchedUser.interests
      );

      // Return the suggestions with all required fields
      res.json({
        success: true,
        suggestions: suggestions.map(suggestion => ({
          title: suggestion.title,
          description: suggestion.description,
          reasoning: suggestion.reasoning
        }))
      });
    } catch (error) {
      console.error('Error getting event suggestions:', error);
      // Send a more detailed error response
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate event suggestions',
        suggestions: []
      });
    }
  });

  // Craft a personalized message
  app.post('/api/matches/messages/craft', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const { matchId, suggestion, eventDetails } = req.body;

      if (!suggestion || typeof suggestion !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid suggestion text'
        });
      }

      if (isNaN(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid match ID'
        });
      }

      // Verify match exists and user is part of it
      const match = await getMatchById(matchId);
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Get matched user details
      const matchedUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const [currentUser, matchedUser] = await Promise.all([
        getUserWithInterests(userId),
        getUserWithInterests(matchedUserId)
      ]);

      if (!currentUser || !matchedUser) {
        return res.status(404).json({
          success: false,
          message: 'User details not found'
        });
      }

      let message: string;
      
      // If this is an event suggestion, generate a conversation starter for it
      if (eventDetails) {
        message = await generateEventConversationStarter(
          eventDetails,
          currentUser.personalityTraits,
          matchedUser.personalityTraits
        );
      } else {
        // Otherwise use the regular message crafting
        message = craftPersonalizedMessage(
          suggestion,
          currentUser.personalityTraits,
          matchedUser.personalityTraits
        );
      }

      res.json({
        success: true,
        message
      });
    } catch (error) {
      console.error('Error crafting message:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to craft message'
      });
    }
  });

  // Get match messages
  app.get('/api/matches/:matchId/messages', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const matchId = parseInt(req.params.matchId);

      if (isNaN(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid match ID. Please provide a valid positive number.'
        });
      }

      // Verify match exists and user is part of it
      const match = await getMatchById(matchId);
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Get messages for the match
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

      res.json({
        success: true,
        messages: matchMessages
      });
    } catch (error) {
      console.error('Error getting match messages:', error);
      next(error);
    }
  });

  // Quiz submission endpoint
  app.post("/api/quiz", validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
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

      // Update user's personality traits and mark quiz as completed
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
  });

  // Create a new match
  app.post('/api/matches', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
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

      // Ensure users are not the same
      if (userId === Number(targetUserId)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create a match with yourself'
        });
      }

      // Get both users with their interests
      const [currentUser, targetUser] = await Promise.all([
        getUserWithInterests(userId),
        getUserWithInterests(Number(targetUserId))
      ]);

      if (!currentUser || !targetUser) {
        return res.status(404).json({
          success: false,
          message: 'One or both users not found'
        });
      }

      // Verify both users have completed their quizzes
      if (!currentUser.quizCompleted || !targetUser.quizCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Both users must complete their personality quizzes before matching'
        });
      }

      // Verify both users have personality traits
      if (!currentUser.personalityTraits || !targetUser.personalityTraits || 
          Object.keys(currentUser.personalityTraits).length === 0 || 
          Object.keys(targetUser.personalityTraits).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Both users must have personality traits data'
        });
      }

      // Check if match already exists
      const existingMatch = await db
        .select()
        .from(matches)
        .where(
          or(
            and(
              eq(matches.userId1, userId),
              eq(matches.userId2, Number(targetUserId))
            ),
            and(
              eq(matches.userId1, Number(targetUserId)),
              eq(matches.userId2, userId)
            )
          )
        )
        .limit(1);

      if (existingMatch.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Match already exists between these users'
        });
      }

      // Calculate compatibility score
      const compatibilityScore = calculateCompatibilityScore(
        currentUser.personalityTraits,
        targetUser.personalityTraits
      );
      const matchScore = Math.max(0, Math.min(100, Math.round(compatibilityScore * 100))); // Ensure score is between 0-100

      console.log('Calculated match score:', {
        user1Id: userId,
        user2Id: targetUserId,
        user1Traits: currentUser.personalityTraits,
        user2Traits: targetUser.personalityTraits,
        compatibilityScore,
        matchScore
      });

      // Create new match
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

      const response = {
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
      };

      console.log('Created match:', response);
      res.json(response);
    } catch (error) {
      console.error('Error creating match:', error);
      next(error);
    }
  });

  // Get potential matches
  app.get('/api/matches/potential', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      console.log('Fetching potential matches for user:', userId);

      // Check if user has completed the quiz
      const [user] = await db
        .select({
          quizCompleted: users.quizCompleted,
          personalityTraits: users.personalityTraits
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user?.quizCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Please complete your personality quiz before viewing potential matches'
        });
      }

      // Get all users except the current user and those already matched
      const existingMatches = await db
        .select({
          otherUserId: sql<number>`CASE 
            WHEN "user_id_1" = ${userId} THEN "user_id_2"
            ELSE "user_id_1"
          END`
        })
        .from(matches)
        .where(
          or(
            eq(matches.userId1, userId),
            eq(matches.userId2, userId)
          )
        );

      console.log('Existing matches:', existingMatches);

      const existingMatchIds = existingMatches.map(m => m.otherUserId);
      console.log('Existing match IDs:', existingMatchIds);

      // Get potential matches using raw SQL for complex conditions
      const potentialUsers = await db.execute<{
        id: number;
        username: string;
        name: string;
        bio: string;
        personalityTraits: Record<string, number>;
        avatar: string;
        quizCompleted: boolean;
      }>(sql`
        SELECT 
          id,
          username,
          name,
          bio,
          personality_traits as "personalityTraits",
          avatar,
          quiz_completed as "quizCompleted"
        FROM users
        WHERE 
          id != ${userId}
          AND quiz_completed = true
          ${existingMatchIds.length > 0 
            ? sql`AND id NOT IN (${sql.join(existingMatchIds.map(id => sql`${id}`), sql`, `)})`
            : sql``}
        LIMIT 10
      `);

      console.log('Found potential matches:', potentialUsers.rows.length);

      // Calculate compatibility scores
      const potentialMatches = potentialUsers.rows.map(potentialUser => {
        // Ensure personalityTraits is properly typed
        const userTraits = user.personalityTraits as Record<string, number>;
        const matchTraits = potentialUser.personalityTraits as Record<string, number>;
        
        const compatibilityScore = calculateCompatibilityScore(
          userTraits,
          matchTraits
        );

        return {
          ...potentialUser,
          compatibilityScore
        };
      }).sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      res.json({
        success: true,
        matches: potentialMatches
      });
    } catch (error) {
      console.error('Error fetching potential matches:', error);
      next(error);
    }
  });

  // Get match by ID
  app.get('/api/matches/:id', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const matchId = parseInt(req.params.id);

      if (isNaN(matchId) || matchId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid match ID. Please provide a valid positive number.'
        });
      }

      // Get match data
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, userId),
              eq(matches.userId2, userId)
            )
          )
        )
        .limit(1);

      if (!match) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Get matched user details
      const matchedUserId = match.userId1 === userId ? match.userId2 : match.userId1;
      const matchedUser = await getUserWithInterests(matchedUserId);

      if (!matchedUser) {
        return res.status(404).json({
          success: false,
          message: 'Matched user not found'
        });
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
  });

  // Send a message in a match
  app.post('/api/matches/:matchId/messages', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
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

      // Verify match exists and user is part of it
      const match = await getMatchById(matchId);
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Create new message
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
        .set({
          lastActivityAt: new Date()
        })
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
        message: {
          ...newMessage,
          sender
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      next(error);
    }
  });

  // Respond to a match request
  app.post('/api/matches/:id', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
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

      // Get match data
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, matchId),
            or(
              eq(matches.userId1, userId),
              eq(matches.userId2, userId)
            )
          )
        )
        .limit(1);

      if (!match) {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      // Only allow responding to pending matches
      if (match.status !== 'requested') {
        return res.status(400).json({
          success: false,
          message: 'Can only respond to requested match requests'
        });
      }

      // Update match status
      const [updatedMatch] = await db
        .update(matches)
        .set({
          status: status as 'accepted' | 'rejected',
          lastActivityAt: new Date()
        })
        .where(eq(matches.id, matchId))
        .returning();

      if (!updatedMatch) {
        throw new Error('Failed to update match status');
      }

      // Get matched user details
      const matchedUserId = match.userId1 === userId ? match.userId2 : match.userId1;
      const matchedUser = await getUserWithInterests(matchedUserId);

      if (!matchedUser) {
        return res.status(404).json({
          success: false,
          message: 'Matched user not found'
        });
      }

      res.json({
        success: true,
        message: `Match ${status}`,
        match: {
          ...updatedMatch,
          user: matchedUser
        }
      });
    } catch (error) {
      console.error('Error responding to match:', error);
      next(error);
    }
  });

  // Get all matches for a user
  app.get('/api/matches', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;

      // Get all matches for the user
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
        .where(
          or(
            eq(matches.userId1, userId),
            eq(matches.userId2, userId)
          )
        )
        .orderBy(desc(matches.lastActivityAt));

      // Get all user IDs from matches
      const userIds = new Set(
        userMatches.map(m => m.user1Id === userId ? m.user2Id : m.user1Id)
      );

      // Get user details for all matched users
      const matchedUsers = await Promise.all(
        Array.from(userIds).map(id => getUserWithInterests(id))
      );

      // Create a map of user details
      const userMap = new Map(
        matchedUsers.filter(Boolean).map(user => [user!.id, user])
      );

      // Format matches with user details
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

      // Group matches by status
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
  });

  // Update user profile
  app.post('/api/user/profile', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const { name, bio } = req.body;

      // Update user profile
      const [updatedUser] = await db
        .update(users)
        .set({
          name: name || '',
          bio: bio || ''
        })
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
  });

  // Upload profile image
  app.post('/api/user/profile/image', validateUser, ensureAuthenticated, upload.single('image'), (async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      const userId = req.user!.id;
      const file = req.file;
      const fileExtension = file.mimetype.split('/')[1];
      const fileName = `avatars/${userId}-${randomUUID()}.${fileExtension}`;

      // Upload to Replit Object Storage
      const { ok, error } = await storage.uploadFromBytes(
        fileName,
        file.buffer
      );

      if (!ok) {
        console.error('Error uploading to object storage:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image'
        });
      }

      // Store just the filename in the database
      const avatarUrl = fileName;  // Just store avatars/userid-uuid.ext

      // Update user's avatar in database
      const [updatedUser] = await db
        .update(users)
        .set({
          avatar: avatarUrl
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new Error('Failed to update user avatar');
      }

      // Update profile progress
      await db
        .update(profileProgress)
        .set({
          sections: sql`jsonb_set(sections, '{avatar}', 'true'::jsonb)`,
          lastUpdated: new Date()
        })
        .where(eq(profileProgress.userId, userId));

      res.json({
        success: true,
        message: 'Profile image updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      next(error);
    }
  }) as express.RequestHandler);

  // Get achievements and progress
  app.get('/api/achievements', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;

      // Get all achievements
      const allAchievements = await db
        .select()
        .from(achievements);

      // Get user's unlocked achievements
      const unlockedAchievements = await db
        .select()
        .from(userAchievements)
        .where(eq(userAchievements.userId, userId));

      // Get user's profile progress
      const [userProgress] = await db
        .select()
        .from(profileProgress)
        .where(eq(profileProgress.userId, userId))
        .limit(1);

      // If no progress record exists, create one
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

        res.json({
          achievements: allAchievements,
          userAchievements: [],
          progress: newProgress
        });
        return;
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
  });

  // Update profile progress
  app.post('/api/profile/progress', validateUser, ensureAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAuthenticated(req)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const userId = req.user.id;
      const { section, completed } = req.body;

      if (!section || typeof completed !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Invalid request body'
        });
      }

      // Get current progress
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

      // Update the specified section
      const updatedSections = {
        ...currentProgress.sections,
        [section]: completed
      };

      // Get all achievements that might be unlocked by this update
      const potentialAchievements = await db
        .select()
        .from(achievements)
        .where(sql`criteria->>'condition' = ${section}`);

      // Get already unlocked achievements
      const unlockedAchievementIds = (await db
        .select()
        .from(userAchievements)
        .where(eq(userAchievements.userId, userId)))
        .map(ua => ua.achievementId);

      // Filter achievements that should be unlocked
      const newAchievements = potentialAchievements.filter(achievement => 
        completed && // Only if the section was completed
        !unlockedAchievementIds.includes(achievement.id) // And achievement wasn't already unlocked
      );

      // Calculate new points
      const additionalPoints = newAchievements.reduce((sum, achievement) => sum + achievement.points, 0);
      const newTotalPoints = currentProgress.totalPoints + additionalPoints;

      // Calculate new level
      const newLevel = calculateLevel(newTotalPoints);
      const leveledUp = newLevel > currentProgress.level;

      // Update progress and unlock achievements in a transaction
      await db.transaction(async (tx) => {
        // Update progress
        await tx
          .update(profileProgress)
          .set({
            sections: updatedSections,
            totalPoints: newTotalPoints,
            level: newLevel,
            lastUpdated: new Date()
          })
          .where(eq(profileProgress.userId, userId));

        // Insert new achievements
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
  });

  // Register error handler
  app.use(errorHandler);

  // Add storage route handler
  app.get('/api/storage/:filename', async (req, res) => {
    try {
      const fileName = req.params.filename;
      
      // Validate filename
      if (!fileName || fileName.includes('..')) {
        console.error('Invalid filename requested:', fileName);
        return res.status(400).json({
          success: false,
          message: 'Invalid filename'
        });
      }
      
      // Clean and validate the file path
      const cleanFileName = decodeURIComponent(fileName).split('/').pop();
      if (!cleanFileName) {
        throw new Error('Invalid filename');
      }

      // Handle the case where the full replit-objstore URL is passed
      if (cleanFileName.includes('replit-objstore')) {
        return res.redirect(cleanFileName);
      }

      // Always use avatars directory and ensure no path traversal
      const filePath = fileName.startsWith('avatars/') ? fileName : `avatars/${cleanFileName}`;
      
      console.log('Attempting to serve file:', filePath);
      
      try {
        const result = await storage.downloadAsBytes(filePath);
        
        if (!result?.ok) {
          console.error('File not found in storage:', filePath);
          throw new Error('File not found');
        }

        const buffer = result.value[0];

        // Determine content type
        const contentType = fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')
          ? 'image/jpeg'
          : fileName.toLowerCase().endsWith('.png')
          ? 'image/png'
          : fileName.toLowerCase().endsWith('.gif')
          ? 'image/gif'
          : 'application/octet-stream';

        // Set appropriate headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Content-Length', buffer.length.toString());
        
        console.log('Successfully serving file:', filePath, 'Content-Type:', contentType);
        res.send(buffer);
      } catch (error) {
        console.error('Error serving file from storage:', filePath, error);
        
        // Always try to serve default avatar as fallback for avatar requests
        if (filePath.includes('avatar')) {
          const defaultAvatarPath = path.join(process.cwd(), 'public', 'default-avatar.png');
          if (require('fs').existsSync(defaultAvatarPath)) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return res.sendFile(defaultAvatarPath);
          }
        }
        
        res.status(404).json({
          success: false,
          message: 'File not found',
          path: filePath
        });
      }
    } catch (error: any) {
      console.error('Error in storage route:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return httpServer;
}
