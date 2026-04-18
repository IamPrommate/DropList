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

/**
 * Client session rev for same-URL updates. Preserves `cb` (or any) query params from DB
 * so we don't strip the server-persisted cache buster.
 */
export function playlistCoverUrlWithCacheBust(url: string | null, rev: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('v', String(rev));
    return u.toString();
  } catch {
    const base = url.split('?')[0];
    return `${base}?v=${rev}`;
  }
}

export function findSavedPlaylistById(
  savedPlaylists: SavedPlaylist[],
  activePlaylistId: string | null
): SavedPlaylist | null {
  if (!activePlaylistId) return null;
  return savedPlaylists.find((p) => p.id === activePlaylistId) ?? null;
}
