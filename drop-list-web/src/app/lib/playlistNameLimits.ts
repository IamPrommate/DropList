/** Max length for saved playlist / album display name (`PATCH /api/playlists`, inline edit). */
export const PLAYLIST_NAME_MAX_LENGTH = 32;

/** Truncate for UI when stored name exceeds max (e.g. legacy rows). */
export function truncatePlaylistNameForDisplay(name: string): string {
  const t = name.trim();
  if (t.length <= PLAYLIST_NAME_MAX_LENGTH) return t;
  return `${t.slice(0, PLAYLIST_NAME_MAX_LENGTH)}...`;
}
