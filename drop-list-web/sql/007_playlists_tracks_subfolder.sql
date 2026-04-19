-- Per-playlist Google Drive tracks subfolder (optional).
-- NULL = legacy: API uses NEXT_PUBLIC_TRACKS_FOLDER when loading.
-- '' = user chose shared folder root for audio.
-- Non-empty = child folder name under the shared link (exact match, case-insensitive).

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS tracks_subfolder TEXT;
