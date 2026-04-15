-- One saved row per Drive folder per user (prevents duplicate inserts / races).
CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_user_id_folder_id
  ON playlists (user_id, folder_id);
