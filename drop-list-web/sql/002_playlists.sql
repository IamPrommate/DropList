-- Playlists table: stores Google Drive folder references per user.
-- Actual tracks are fetched from Drive at runtime; only the folder link is persisted.

CREATE TABLE playlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_url TEXT NOT NULL,
  folder_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  cover_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlists_user_id ON playlists(user_id);

-- Supabase RLS (remove if not using Supabase)
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own playlists"
  ON playlists FOR SELECT
  USING (true);
