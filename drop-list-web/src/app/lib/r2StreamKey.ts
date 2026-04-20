/** Safe slug for `audio/{tier}/{fileId}` (alphanumeric, underscore, hyphen). */
const TIER_RE = /^[a-zA-Z0-9_-]{1,32}$/;

export function normalizeR2QualityTier(raw: string | undefined | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return TIER_RE.test(t) ? t : null;
}

/**
 * R2 object key for cached audio. No tier → legacy `audio/{fileId}`.
 * With tier (e.g. `standard`, `hi`) → `audio/{tier}/{fileId}`.
 */
export function getR2ObjectKey(fileId: string, tier: string | null): string {
  const id = fileId.trim();
  if (!tier) return `audio/${id}`;
  return `audio/${tier}/${id}`;
}
