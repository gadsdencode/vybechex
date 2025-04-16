-- Migration: create_achievements
-- Up
BEGIN;

-- Clear existing data
TRUNCATE TABLE user_achievements CASCADE;
TRUNCATE TABLE achievements CASCADE;

-- Reset sequence
ALTER SEQUENCE achievements_id_seq RESTART WITH 1;

-- Insert Profile Achievements
INSERT INTO achievements (name, description, category, points, icon, criteria)
VALUES
  ('Welcome Aboard!', 'Create your account and join the community', 'profile', 100, '👋', 
   '{"type": "profile", "condition": "registration"}'::jsonb),
  ('Identity Established', 'Complete your profile with all information', 'profile', 200, '📝',
   '{"type": "profile", "condition": "profileComplete"}'::jsonb),
  ('Face in the Crowd', 'Upload your first profile picture', 'profile', 150, '🖼️',
   '{"type": "profile", "condition": "avatarUploaded"}'::jsonb),
  ('Wordsmith', 'Write a bio that truly captures who you are', 'profile', 100, '✍️',
   '{"type": "profile", "condition": "bioAdded"}'::jsonb),
  ('Passion Finder', 'Add at least 5 interests to your profile', 'profile', 150, '⭐',
   '{"type": "profile", "condition": "interestsAdded", "threshold": 5}'::jsonb),

  -- Streak Achievements
  ('First Steps', 'Log in for the first time', 'streak', 50, '🎯',
   '{"type": "login", "condition": "first_login"}'::jsonb),
  ('Regular Visitor', 'Log in 3 days in a row', 'streak', 150, '📅',
   '{"type": "streak", "condition": "daily", "threshold": 3}'::jsonb),
  ('Week Warrior', 'Log in 7 days in a row', 'streak', 300, '🗓️',
   '{"type": "streak", "condition": "daily", "threshold": 7}'::jsonb),
  ('Monthly Master', 'Log in 30 days in a row', 'streak', 1000, '🏆',
   '{"type": "streak", "condition": "daily", "threshold": 30}'::jsonb),
  ('Centurion', 'Maintain a 100-day login streak', 'streak', 5000, '👑',
   '{"type": "streak", "condition": "daily", "threshold": 100}'::jsonb),
  ('Weekend Warrior', 'Log in every weekend for a month', 'streak', 500, '🎮',
   '{"type": "streak", "condition": "weekly_weekend", "threshold": 4}'::jsonb),

  -- Engagement Achievements
  ('Triple Dipper', 'Visit 3 times in one day', 'engagement', 100, '🎲',
   '{"type": "count", "condition": "login", "threshold": 3, "timeframe": "daily"}'::jsonb),
  ('High Five', 'Visit 5 times in one day', 'engagement', 200, '✋',
   '{"type": "count", "condition": "login", "threshold": 5, "timeframe": "daily"}'::jsonb),
  ('Weekly Wonder', 'Visit 20 times in one week', 'engagement', 400, '⭐',
   '{"type": "count", "condition": "login", "threshold": 20, "timeframe": "weekly"}'::jsonb),
  ('Time Well Spent', 'Spend 5 hours actively using the app', 'engagement', 300, '⌛',
   '{"type": "count", "condition": "active_time", "threshold": 5, "timeframe": "all_time"}'::jsonb),
  ('Night Owl', 'Log in after midnight 5 times', 'engagement', 250, '🦉',
   '{"type": "count", "condition": "night_login", "threshold": 5, "timeframe": "all_time"}'::jsonb),
  ('Early Bird', 'Log in before 7 AM 5 times', 'engagement', 250, '🌅',
   '{"type": "count", "condition": "morning_login", "threshold": 5, "timeframe": "all_time"}'::jsonb),

  -- Milestone Achievements
  ('Century Club', 'Visit the app 100 times total', 'milestone', 500, '💯',
   '{"type": "milestone", "condition": "login", "threshold": 100}'::jsonb),
  ('Dedicated Fan', 'Visit the app 500 times total', 'milestone', 1500, '🌟',
   '{"type": "milestone", "condition": "login", "threshold": 500}'::jsonb),
  ('True Devotee', 'Visit the app 1,000 times total', 'milestone', 3000, '👑',
   '{"type": "milestone", "condition": "login", "threshold": 1000}'::jsonb),
  ('Rising Star', 'Reach level 5', 'milestone', 500, '⚡',
   '{"type": "milestone", "condition": "level", "threshold": 5}'::jsonb),
  ('Power Player', 'Reach level 10', 'milestone', 1000, '💫',
   '{"type": "milestone", "condition": "level", "threshold": 10}'::jsonb),
  ('Elite Status', 'Reach level 20', 'milestone', 2000, '🎭',
   '{"type": "milestone", "condition": "level", "threshold": 20}'::jsonb),

  -- Social Achievements
  ('Ice Breaker', 'Send your first message', 'social', 100, '💬',
   '{"type": "milestone", "condition": "first_message"}'::jsonb),
  ('Chatty Cathy', 'Send 100 messages', 'social', 300, '📨',
   '{"type": "milestone", "condition": "messages", "threshold": 100}'::jsonb),
  ('Message Master', 'Send 1,000 messages', 'social', 1000, '📬',
   '{"type": "milestone", "condition": "messages", "threshold": 1000}'::jsonb),
  ('Perfect Match', 'Get your first connection match', 'social', 200, '🤝',
   '{"type": "milestone", "condition": "first_match"}'::jsonb),
  ('Social Butterfly', 'Connect with 5 different people', 'social', 500, '🦋',
   '{"type": "milestone", "condition": "matches", "threshold": 5}'::jsonb),
  ('Networking Pro', 'Connect with 20 different people', 'social', 1000, '🌐',
   '{"type": "milestone", "condition": "matches", "threshold": 20}'::jsonb),
  ('Conversation Starter', 'Start 10 conversations in one day', 'social', 300, '🗣️',
   '{"type": "count", "condition": "conversations_started", "threshold": 10, "timeframe": "daily"}'::jsonb),
  ('Quick Draw', 'Respond to 5 messages within 5 minutes', 'social', 250, '⚡',
   '{"type": "count", "condition": "quick_responses", "threshold": 5, "timeframe": "all_time"}'::jsonb),
  ('Marathon Runner', 'Maintain a conversation for over an hour', 'social', 400, '🏃',
   '{"type": "milestone", "condition": "long_conversation", "threshold": 60}'::jsonb);

COMMIT;

-- Down
BEGIN;
TRUNCATE TABLE user_achievements CASCADE;
TRUNCATE TABLE achievements CASCADE;
COMMIT; 