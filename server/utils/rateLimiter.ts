// server/utils/rateLimiter.ts
// PostgreSQL-based rate limiting to persist limits across server restarts

import { db } from '@db';
import { sql } from 'drizzle-orm';

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 3600000; // 1 hour

interface RateLimitConfig {
  maxRequests?: number;
  windowMs?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
}

/**
 * PostgreSQL-based rate limiter that persists across server restarts
 * 
 * Uses atomic operations to ensure thread-safety across multiple instances
 */
export class PgRateLimiter {
  private readonly tableName = 'rate_limits';
  private initialized = false;

  constructor() {
    // Table will be created on first use
  }

  /**
   * Initialize the rate_limits table if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ${sql.identifier(this.tableName)} (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) NOT NULL,
          count INTEGER DEFAULT 0 NOT NULL,
          window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          UNIQUE(key)
        )
      `);

      // Create index for faster lookups
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON ${sql.identifier(this.tableName)} (key)
      `);

      this.initialized = true;
      console.log('Rate limiter table initialized');
    } catch (error) {
      console.error('Failed to initialize rate limiter table:', error);
      throw error;
    }
  }

  /**
   * Check and update rate limit for a given key
   * 
   * @param key - Unique identifier (e.g., `user:${userId}:match_requests`)
   * @param config - Rate limit configuration
   * @returns Rate limit result with allowed status and remaining requests
   */
  async checkLimit(key: string, config: RateLimitConfig = {}): Promise<RateLimitResult> {
    await this.initialize();

    const maxRequests = config.maxRequests || DEFAULT_MAX_REQUESTS;
    const windowMs = config.windowMs || DEFAULT_WINDOW_MS;
    const windowStart = new Date(Date.now() - windowMs);

    try {
      // Use a single atomic operation to check and update the rate limit
      const result = await db.execute<{
        count: number;
        window_start: Date;
        is_new_window: boolean;
      }>(sql`
        INSERT INTO ${sql.identifier(this.tableName)} (key, count, window_start)
        VALUES (${key}, 1, NOW())
        ON CONFLICT (key) DO UPDATE SET
          count = CASE 
            WHEN ${sql.identifier(this.tableName)}.window_start < ${windowStart} THEN 1
            ELSE ${sql.identifier(this.tableName)}.count + 1
          END,
          window_start = CASE
            WHEN ${sql.identifier(this.tableName)}.window_start < ${windowStart} THEN NOW()
            ELSE ${sql.identifier(this.tableName)}.window_start
          END
        RETURNING 
          count,
          window_start,
          (${sql.identifier(this.tableName)}.window_start < ${windowStart}) as is_new_window
      `);

      const row = result.rows[0];
      if (!row) {
        // Fallback: allow the request but log the issue
        console.warn('Rate limit check returned no rows for key:', key);
        return {
          allowed: true,
          remaining: maxRequests - 1,
          resetTime: new Date(Date.now() + windowMs)
        };
      }

      const count = row.count;
      const resetTime = new Date(new Date(row.window_start).getTime() + windowMs);
      const allowed = count <= maxRequests;
      const remaining = Math.max(0, maxRequests - count);

      return {
        allowed,
        remaining,
        resetTime
      };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // On error, allow the request to avoid blocking legitimate users
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(Date.now() + windowMs)
      };
    }
  }

  /**
   * Reset rate limit for a given key
   */
  async resetLimit(key: string): Promise<void> {
    await this.initialize();

    try {
      await db.execute(sql`
        DELETE FROM ${sql.identifier(this.tableName)} WHERE key = ${key}
      `);
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
    }
  }

  /**
   * Cleanup expired rate limit entries (call periodically)
   */
  async cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    await this.initialize();

    try {
      const cutoff = new Date(Date.now() - maxAgeMs);
      const result = await db.execute<{ count: string }>(sql`
        WITH deleted AS (
          DELETE FROM ${sql.identifier(this.tableName)}
          WHERE window_start < ${cutoff}
          RETURNING *
        )
        SELECT COUNT(*) as count FROM deleted
      `);

      const deletedCount = parseInt(result.rows[0]?.count || '0', 10);
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired rate limit entries`);
      }
      return deletedCount;
    } catch (error) {
      console.error('Rate limit cleanup failed:', error);
      return 0;
    }
  }
}

// Singleton instance
export const rateLimiter = new PgRateLimiter();

/**
 * Check match request rate limit for a user
 */
export async function checkMatchRequestLimit(userId: number): Promise<boolean> {
  const key = `user:${userId}:match_requests`;
  const result = await rateLimiter.checkLimit(key, {
    maxRequests: 20,
    windowMs: 3600000 // 1 hour
  });
  return result.allowed;
}

/**
 * Get rate limit status for match requests
 */
export async function getMatchRequestLimitStatus(userId: number): Promise<RateLimitResult> {
  const key = `user:${userId}:match_requests`;
  return rateLimiter.checkLimit(key, {
    maxRequests: 20,
    windowMs: 3600000
  });
}
