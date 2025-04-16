import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Achievements table to track available badges/rewards
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // profile, social, quiz, etc.
  points: integer("points").notNull(),
  icon: text("icon").notNull(), // Icon/badge image path
  criteria: jsonb("criteria").$type<{
    type: string;
    target: number;
    condition?: string;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User achievements junction table to track earned achievements
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  achievementId: integer("achievement_id").references(() => achievements.id, { onDelete: 'cascade' }).notNull(),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
});

// Profile completion tracking
export const profileProgress = pgTable("profile_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  totalPoints: integer("total_points").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  completionPercentage: real("completion_percentage").default(0).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  sections: jsonb("sections").$type<{
    basicInfo: boolean;
    avatar: boolean;
    interests: boolean;
    quiz: boolean;
    bio: boolean;
    connections: boolean;
  }>().notNull(),
});

// Interest categories table
export const interestCategories = pgTable("interest_categories", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Interests table
export const interests = pgTable("interests", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  categoryId: integer("category_id").references(() => interestCategories.id, { onDelete: 'cascade' }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  name: text("name").default("").notNull(),
  bio: text("bio").default("").notNull(),
  quizCompleted: boolean("quiz_completed").default(false).notNull(),
  personalityTraits: jsonb("personality_traits").$type<Record<string, number>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isGroupCreator: boolean("is_group_creator").default(false).notNull(),
  avatar: text("avatar").default("/default-avatar.png").notNull(),
  level: integer("level").default(1).notNull(),
  xp: integer("xp").default(0).notNull(),
  lastRewardClaimed: timestamp("last_reward_claimed"),
  stripeCustomerId: text("stripe_customer_id"),
});

// Add relations for achievements and profile progress
export const achievementRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
}));

export const userAchievementRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
}));

export const profileProgressRelations = relations(profileProgress, ({ one }) => ({
  user: one(users, {
    fields: [profileProgress.userId],
    references: [users.id],
  }),
}));

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  userId1: integer("user_id_1").notNull().references(() => users.id, { onDelete: 'cascade' }),
  userId2: integer("user_id_2").notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: integer("score").default(0).notNull(),
  status: text("status", { enum: ['requested', 'pending', 'accepted', 'rejected', 'potential'] })
    .notNull()
    .default("requested"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
  verificationCode: text("verification_code"),
  matchType: text("match_type", { enum: ['request', 'direct'] }).default('request').notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: 'cascade' }),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  analyzed: boolean("analyzed").default(false),
  sentiment: jsonb("sentiment").$type<{
    score: number;
    magnitude: number;
    labels: string[];
  }>(),
});

export const matchesRelations = relations(matches, ({ one }) => ({
  user1: one(users, {
    fields: [matches.userId1],
    references: [users.id],
  }),
  user2: one(users, {
    fields: [matches.userId2],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  match: one(matches, {
    fields: [messages.matchId],
    references: [matches.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

// User interests junction table
export const userInterests = pgTable("user_interests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  interestId: integer("interest_id").references(() => interests.id, { onDelete: 'cascade' }).notNull(),
  score: integer("score").default(0).notNull(), // Interest level/score from 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Add relations for interests
export const interestRelations = relations(interests, ({ one, many }) => ({
  category: one(interestCategories, {
    fields: [interests.categoryId],
    references: [interestCategories.id],
  }),
  users: many(userInterests),
}));

// Add relations for users with interests
export const userInterestRelations = relations(userInterests, ({ one }) => ({
  user: one(users, {
    fields: [userInterests.userId],
    references: [users.id],
  }),
  interest: one(interests, {
    fields: [userInterests.interestId],
    references: [interests.id],
  }),
}));

// Create schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export const insertMatchSchema = createInsertSchema(matches);
export const selectMatchSchema = createSelectSchema(matches);

// Create schemas for validation
export const insertInterestCategorySchema = createInsertSchema(interestCategories);
export const selectInterestCategorySchema = createSelectSchema(interestCategories);
export const insertInterestSchema = createInsertSchema(interests);
export const selectInterestSchema = createSelectSchema(interests);
export const insertUserInterestSchema = createInsertSchema(userInterests);
export const selectUserInterestSchema = createSelectSchema(userInterests);

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Interest = typeof interests.$inferSelect;
export type NewInterest = typeof interests.$inferInsert;
export type InterestCategory = typeof interestCategories.$inferSelect;
export type NewInterestCategory = typeof interestCategories.$inferInsert;
export type UserInterest = typeof userInterests.$inferSelect;
export type NewUserInterest = typeof userInterests.$inferInsert;

// Create schemas for achievements and progress
export const insertAchievementSchema = createInsertSchema(achievements);
export const selectAchievementSchema = createSelectSchema(achievements);
export const insertUserAchievementSchema = createInsertSchema(userAchievements);
export const selectUserAchievementSchema = createSelectSchema(userAchievements);
export const insertProfileProgressSchema = createInsertSchema(profileProgress);
export const selectProfileProgressSchema = createSelectSchema(profileProgress);

// Export types for new tables
export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type ProfileProgress = typeof profileProgress.$inferSelect;
export type NewProfileProgress = typeof profileProgress.$inferInsert;

// Export schema types for auth
export type SelectUser = User;
export type InsertUser = NewUser;

export type AchievementCategory = 
  | 'profile'
  | 'engagement'
  | 'social'
  | 'streak'
  | 'milestone';

export type AchievementCriteriaType = 
  | 'profile' 
  | 'login' 
  | 'streak' 
  | 'count' 
  | 'milestone';

export type TimeFrame = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface AchievementCriteria {
  type: AchievementCriteriaType;
  condition: string;
  threshold?: number;
  timeframe?: TimeFrame;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: AchievementCategory;
  criteria: AchievementCriteria;
}

export interface UserAchievementProgress {
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  progress?: number;
}

export interface UserStreakData {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: Date;
  loginCount: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };
  lastReset: {
    daily: Date;
    weekly: Date;
    monthly: Date;
  };
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Profile Achievements
  {
    id: 'profile_created',
    name: 'Welcome Aboard!',
    description: 'Create your account and join the community',
    icon: '👋',
    points: 100,
    category: 'profile',
    criteria: { type: 'profile', condition: 'registration' }
  },
  {
    id: 'profile_complete',
    name: 'Identity Established',
    description: 'Complete your profile with all information',
    icon: '📝',
    points: 200,
    category: 'profile',
    criteria: { type: 'profile', condition: 'profileComplete' }
  },
  {
    id: 'avatar_uploaded',
    name: 'Face in the Crowd',
    description: 'Upload your first profile picture',
    icon: '🖼️',
    points: 150,
    category: 'profile',
    criteria: { type: 'profile', condition: 'avatarUploaded' }
  },
  {
    id: 'bio_master',
    name: 'Wordsmith',
    description: 'Write a bio that truly captures who you are',
    icon: '✍️',
    points: 100,
    category: 'profile',
    criteria: { type: 'profile', condition: 'bioAdded' }
  },
  {
    id: 'interests_added',
    name: 'Passion Finder',
    description: 'Add at least 5 interests to your profile',
    icon: '⭐',
    points: 150,
    category: 'profile',
    criteria: { type: 'profile', condition: 'interestsAdded', threshold: 5 }
  },

  // Login Streaks
  {
    id: 'first_login',
    name: 'First Steps',
    description: 'Log in for the first time',
    icon: '🎯',
    points: 50,
    category: 'streak',
    criteria: { type: 'login', condition: 'first_login' }
  },
  {
    id: 'daily_login_3',
    name: 'Regular Visitor',
    description: 'Log in 3 days in a row',
    icon: '📅',
    points: 150,
    category: 'streak',
    criteria: { type: 'streak', condition: 'daily', threshold: 3 }
  },
  {
    id: 'daily_login_7',
    name: 'Week Warrior',
    description: 'Log in 7 days in a row',
    icon: '🗓️',
    points: 300,
    category: 'streak',
    criteria: { type: 'streak', condition: 'daily', threshold: 7 }
  },
  {
    id: 'daily_login_30',
    name: 'Monthly Master',
    description: 'Log in 30 days in a row',
    icon: '🏆',
    points: 1000,
    category: 'streak',
    criteria: { type: 'streak', condition: 'daily', threshold: 30 }
  },
  {
    id: 'daily_login_100',
    name: 'Centurion',
    description: 'Maintain a 100-day login streak',
    icon: '👑',
    points: 5000,
    category: 'streak',
    criteria: { type: 'streak', condition: 'daily', threshold: 100 }
  },
  {
    id: 'weekly_regular',
    name: 'Weekend Warrior',
    description: 'Log in every weekend for a month',
    icon: '🎮',
    points: 500,
    category: 'streak',
    criteria: { type: 'streak', condition: 'weekly_weekend', threshold: 4 }
  },

  // Engagement Frequency
  {
    id: 'daily_visits_3',
    name: 'Triple Dipper',
    description: 'Visit 3 times in one day',
    icon: '🎲',
    points: 100,
    category: 'engagement',
    criteria: { type: 'count', condition: 'login', threshold: 3, timeframe: 'daily' }
  },
  {
    id: 'daily_visits_5',
    name: 'High Five',
    description: 'Visit 5 times in one day',
    icon: '✋',
    points: 200,
    category: 'engagement',
    criteria: { type: 'count', condition: 'login', threshold: 5, timeframe: 'daily' }
  },
  {
    id: 'weekly_visits_20',
    name: 'Weekly Wonder',
    description: 'Visit 20 times in one week',
    icon: '⭐',
    points: 400,
    category: 'engagement',
    criteria: { type: 'count', condition: 'login', threshold: 20, timeframe: 'weekly' }
  },
  {
    id: 'active_hours_5',
    name: 'Time Well Spent',
    description: 'Spend 5 hours actively using the app',
    icon: '⌛',
    points: 300,
    category: 'engagement',
    criteria: { type: 'count', condition: 'active_time', threshold: 5, timeframe: 'all_time' }
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Log in after midnight 5 times',
    icon: '🦉',
    points: 250,
    category: 'engagement',
    criteria: { type: 'count', condition: 'night_login', threshold: 5, timeframe: 'all_time' }
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Log in before 7 AM 5 times',
    icon: '🌅',
    points: 250,
    category: 'engagement',
    criteria: { type: 'count', condition: 'morning_login', threshold: 5, timeframe: 'all_time' }
  },

  // Milestones
  {
    id: 'visits_100',
    name: 'Century Club',
    description: 'Visit the app 100 times total',
    icon: '💯',
    points: 500,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'login', threshold: 100 }
  },
  {
    id: 'visits_500',
    name: 'Dedicated Fan',
    description: 'Visit the app 500 times total',
    icon: '🌟',
    points: 1500,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'login', threshold: 500 }
  },
  {
    id: 'visits_1000',
    name: 'True Devotee',
    description: 'Visit the app 1,000 times total',
    icon: '👑',
    points: 3000,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'login', threshold: 1000 }
  },
  {
    id: 'level_5',
    name: 'Rising Star',
    description: 'Reach level 5',
    icon: '⚡',
    points: 500,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'level', threshold: 5 }
  },
  {
    id: 'level_10',
    name: 'Power Player',
    description: 'Reach level 10',
    icon: '💫',
    points: 1000,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'level', threshold: 10 }
  },
  {
    id: 'level_20',
    name: 'Elite Status',
    description: 'Reach level 20',
    icon: '🎭',
    points: 2000,
    category: 'milestone',
    criteria: { type: 'milestone', condition: 'level', threshold: 20 }
  },

  // Social Achievements
  {
    id: 'first_message',
    name: 'Ice Breaker',
    description: 'Send your first message',
    icon: '💬',
    points: 100,
    category: 'social',
    criteria: { type: 'milestone', condition: 'first_message' }
  },
  {
    id: 'messages_100',
    name: 'Chatty Cathy',
    description: 'Send 100 messages',
    icon: '📨',
    points: 300,
    category: 'social',
    criteria: { type: 'milestone', condition: 'messages', threshold: 100 }
  },
  {
    id: 'messages_1000',
    name: 'Message Master',
    description: 'Send 1,000 messages',
    icon: '📬',
    points: 1000,
    category: 'social',
    criteria: { type: 'milestone', condition: 'messages', threshold: 1000 }
  },
  {
    id: 'first_match',
    name: 'Perfect Match',
    description: 'Get your first connection match',
    icon: '🤝',
    points: 200,
    category: 'social',
    criteria: { type: 'milestone', condition: 'first_match' }
  },
  {
    id: 'matches_5',
    name: 'Social Butterfly',
    description: 'Connect with 5 different people',
    icon: '🦋',
    points: 500,
    category: 'social',
    criteria: { type: 'milestone', condition: 'matches', threshold: 5 }
  },
  {
    id: 'matches_20',
    name: 'Networking Pro',
    description: 'Connect with 20 different people',
    icon: '🌐',
    points: 1000,
    category: 'social',
    criteria: { type: 'milestone', condition: 'matches', threshold: 20 }
  },
  {
    id: 'conversation_starter',
    name: 'Conversation Starter',
    description: 'Start 10 conversations in one day',
    icon: '🗣️',
    points: 300,
    category: 'social',
    criteria: { type: 'count', condition: 'conversations_started', threshold: 10, timeframe: 'daily' }
  },
  {
    id: 'quick_responder',
    name: 'Quick Draw',
    description: 'Respond to 5 messages within 5 minutes',
    icon: '⚡',
    points: 250,
    category: 'social',
    criteria: { type: 'count', condition: 'quick_responses', threshold: 5, timeframe: 'all_time' }
  },
  {
    id: 'conversation_marathon',
    name: 'Marathon Runner',
    description: 'Maintain a conversation for over an hour',
    icon: '🏃',
    points: 400,
    category: 'social',
    criteria: { type: 'milestone', condition: 'long_conversation', threshold: 60 }
  }
] as const;
