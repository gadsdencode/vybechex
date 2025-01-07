import type { Request, Response, NextFunction } from 'express';
import type { SelectUser } from '@db/schema';

interface AuthenticatedRequest extends Request {
  user: SelectUser;
}

// Middleware to validate user authentication
export function validateUser(req: Request, res: Response, next: NextFunction) {
  // Check if session exists
  if (!req.session) {
    console.error('No session found');
    return res.status(401).json({ error: 'Session expired' });
  }

  // Check if user is authenticated
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Ensure user has required properties
  const user = req.user as SelectUser;
  if (!user.id) {
    return res.status(401).json({ error: 'Invalid user session' });
  }

  // Touch the session to prevent expiration
  req.session.touch();
  
  next();
} 