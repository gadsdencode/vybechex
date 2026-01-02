// server/routes.ts
// Route registration - delegates to controllers

import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import cors from 'cors';
import multer, { FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { validateUser } from './middleware/auth';

// Import controllers
import {
  ensureAuthenticated,
  errorHandler,
  // Match handlers
  getChatSuggestions,
  getEventSuggestions,
  craftMessage,
  createMatch,
  getPotentialMatches,
  getMatch,
  respondToMatch,
  getAllMatches,
  // Message handlers
  getMessages,
  sendMessage,
  // User handlers
  submitQuiz,
  updateProfile,
  getAchievements,
  updateProfileProgress,
  // Storage handlers
  uploadProfileImage,
  getAvatar
} from './controllers';

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Enable CORS
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only image files are allowed'));
        return;
      }
      cb(null, true);
    }
  });

  // ============================================
  // Match Routes
  // ============================================
  app.post('/api/matches/suggestions', validateUser, ensureAuthenticated, getChatSuggestions);
  app.post('/api/matches/suggestions/events', validateUser, ensureAuthenticated, getEventSuggestions);
  app.post('/api/matches/messages/craft', validateUser, ensureAuthenticated, craftMessage);
  app.get('/api/matches/potential', validateUser, ensureAuthenticated, getPotentialMatches);
  app.get('/api/matches/:id', validateUser, ensureAuthenticated, getMatch);
  app.post('/api/matches/:id', validateUser, ensureAuthenticated, respondToMatch);
  app.get('/api/matches', validateUser, ensureAuthenticated, getAllMatches);
  app.post('/api/matches', validateUser, ensureAuthenticated, createMatch);

  // ============================================
  // Message Routes
  // ============================================
  app.get('/api/matches/:matchId/messages', validateUser, ensureAuthenticated, getMessages);
  app.post('/api/matches/:matchId/messages', validateUser, ensureAuthenticated, sendMessage);

  // ============================================
  // User Routes
  // ============================================
  app.post('/api/quiz', validateUser, ensureAuthenticated, submitQuiz);
  app.post('/api/user/profile', validateUser, ensureAuthenticated, updateProfile);
  app.get('/api/achievements', validateUser, ensureAuthenticated, getAchievements);
  app.post('/api/profile/progress', validateUser, ensureAuthenticated, updateProfileProgress);

  // ============================================
  // Storage Routes
  // ============================================
  app.post('/api/user/profile/image', validateUser, ensureAuthenticated, upload.single('image'), uploadProfileImage as express.RequestHandler);
  app.get('/api/avatars/:filename(*)', getAvatar);

  // Register error handler
  app.use(errorHandler);

  return httpServer;
}
