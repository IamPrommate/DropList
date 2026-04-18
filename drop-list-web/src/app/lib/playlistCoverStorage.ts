/**
 * Supabase Storage bucket for playlist cover images (public read for `<img src>`).
 * Objects: `{userId}/{playlistId}.jpg` — see `sql/005_storage_playlist_covers.sql`.
 */
export const PLAYLIST_COVERS_BUCKET =
  process.env.PLAYLIST_COVERS_BUCKET ?? 'playlist-covers';
