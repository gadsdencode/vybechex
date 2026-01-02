// server/controllers/storageController.ts
// Storage-related route handlers (avatar upload, retrieval)

import type { Request, Response, NextFunction } from 'express';
import { db } from '@db';
import { users, profileProgress } from '@db/schema';
import { eq, sql } from 'drizzle-orm';
import { Client } from '@replit/object-storage';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { isAuthenticated } from './shared';

// Initialize Replit Object Storage client
const storage = new Client();

// Upload profile image
export async function uploadProfileImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
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

    const { ok, error } = await storage.uploadFromBytes(fileName, file.buffer);

    if (!ok) {
      console.error('Error uploading to object storage:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image'
      });
    }

    const avatarUrl = fileName;

    const [updatedUser] = await db
      .update(users)
      .set({ avatar: avatarUrl })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error('Failed to update user avatar');
    }

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
}

// Get avatar file
export async function getAvatar(req: Request, res: Response) {
  try {
    const fileName = req.params.filename;
    
    if (!fileName || fileName.includes('..')) {
      console.error('Invalid filename requested:', fileName);
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    if (fileName.includes('replit-objstore')) {
      return res.redirect(fileName);
    }

    const filePath = fileName.startsWith('avatars/') ? fileName : `avatars/${fileName}`;
    
    console.log('Attempting to serve file:', filePath);
    
    try {
      const result = await storage.downloadAsBytes(filePath);
      
      if (!result?.ok) {
        console.error('File not found in storage:', filePath);
        throw new Error('File not found');
      }

      const buffer = result.value[0];

      const contentType = fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : fileName.toLowerCase().endsWith('.png')
        ? 'image/png'
        : fileName.toLowerCase().endsWith('.gif')
        ? 'image/gif'
        : 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Content-Length', buffer.length.toString());
      
      console.log('Successfully serving file:', filePath, 'Content-Type:', contentType);
      res.send(buffer);
    } catch (error) {
      console.error('Error serving file from storage:', filePath, error);
      
      const defaultAvatarPath = path.join(process.cwd(), 'public', 'default-avatar.png');
      if (fs.existsSync(defaultAvatarPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.sendFile(defaultAvatarPath);
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
}
