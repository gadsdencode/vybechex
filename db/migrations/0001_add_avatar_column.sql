-- Add avatar column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;

-- Set default avatar for existing users
UPDATE users SET avatar = '/default-avatar.png' WHERE avatar IS NULL;
