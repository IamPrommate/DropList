-- Cached audio track count per saved playlist (filled from Drive on load / prefetch).

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS audio_track_count INTEGER;

COMMENT ON COLUMN playlists.audio_track_count IS 'Number of audio files in the Drive folder; updated when listing folder or prefetching metadata';
