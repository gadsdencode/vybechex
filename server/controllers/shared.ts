// server/controllers/shared.ts
// Shared types, utilities, and middleware for controllers

import type { Request, Response, NextFunction } from 'express';
import type { SelectUser } from '@db/schema';
import type { Interest } from '../utils/userQueries';

// Re-export matching utilities from the centralized module
export { 
  calculateCompatibilityScore, 
  calculateComplexityScore,
  calculatePersonalityScore,
  type PersonalityTraits 
} from '../utils/matching';

export type MatchStatus = 'none' | 'requested' | 'pending' | 'accepted' | 'rejected' | 'potential';

export interface AuthenticatedRequest extends Request {
  user: SelectUser;
}

export interface AuthenticatedFileRequest extends Request {
  user: SelectUser;
  file?: Express.Multer.File;
}

export interface FormattedMatch {
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

// Type guard to ensure request is authenticated
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return req.user !== undefined && 'id' in req.user;
}

// Middleware to ensure request is authenticated
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Error handler middleware
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('API Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// Helper function to calculate user level based on points
export function calculateLevel(points: number): number {
  return Math.floor(points / 1000) + 1;
}
