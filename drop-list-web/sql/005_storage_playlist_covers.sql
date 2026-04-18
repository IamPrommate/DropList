-- Supabase Storage: public bucket for user-uploaded playlist cover images.
-- Path convention (set in app): {userId}/{playlistId}.jpg
-- Run in Supabase SQL Editor after deploy; uploads use service role from API routes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'playlist-covers',
  'playlist-covers',
  true,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Playlist covers public read" ON storage.objects;

-- Anonymous and logged-in clients can read cover images (URLs are used in <img src>).
CREATE POLICY "Playlist covers public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'playlist-covers');

-- Writes only via service role (API routes); no INSERT policy for anon/auth clients.
