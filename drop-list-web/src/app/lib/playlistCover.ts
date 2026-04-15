import type { SavedPlaylist } from './types';

/**
 * Canonical cover URL for a saved playlist (sidebar + main header should use this only).
 * When you add “edit album cover”, update `cover_url` on the playlist in Supabase + `savedPlaylists` state;
 * both UIs stay in sync because they read the same field.
 */
export function getPlaylistCoverUrl(playlist: SavedPlaylist | null | undefined): string | null {
  if (!playlist) return null;
  const u = playlist.cover_url;
  if (typeof u !== 'string' || !u.trim()) return null;
  return u;
}

export function findSavedPlaylistById(
  savedPlaylists: SavedPlaylist[],
  activePlaylistId: string | null
): SavedPlaylist | null {
  if (!activePlaylistId) return null;
  return savedPlaylists.find((p) => p.id === activePlaylistId) ?? null;
}
