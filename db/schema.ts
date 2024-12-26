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
