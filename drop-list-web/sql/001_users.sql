-- Users table: stores accounts synced from Google OAuth via NextAuth.
-- Primary key is the Google "sub" (subject) ID.

CREATE TABLE users (
  id                     TEXT PRIMARY KEY,
  email                  TEXT UNIQUE NOT NULL,
  name                   TEXT,
  image                  TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  daily_plays            INTEGER NOT NULL DEFAULT 0,
  daily_plays_date       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase RLS (remove if not using Supabase)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own row"
  ON users FOR SELECT
  USING (true);
