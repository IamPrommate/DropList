import { normalizeR2QualityTier } from './r2StreamKey';

/**
 * Resolves a Google Drive file id to a playable URL.
 * When R2 is configured, `/api/stream-url` returns a public R2 URL (browser loads audio directly).
 * On failure or missing config, falls back to same-origin `/api/drive-file` proxy.
 *
 * In-memory cache + in-flight dedupe: repeat calls for the same id skip extra round-trips
 * (R2 is still “hot” on the server; this avoids redundant HeadObject+JSON work from the client).
 *
 * Optional `NEXT_PUBLIC_R2_AUDIO_TIER` must match server `R2_AUDIO_TIER` / `?q=` so keys align
 * (`audio/{tier}/{fileId}` vs legacy `audio/{fileId}`).
 */

function publicAudioTier(): string | null {
  return normalizeR2QualityTier(
    typeof process.env.NEXT_PUBLIC_R2_AUDIO_TIER === 'string'
      ? process.env.NEXT_PUBLIC_R2_AUDIO_TIER
      : null
  );
}

/** Path + query for GET `/api/stream-url` (used by player resolve and playlist prefetch). */
export function buildStreamUrlPath(fileId: string): string {
  const id = encodeURIComponent(fileId.trim());
  const tier = publicAudioTier();
  const q = tier ? `&q=${encodeURIComponent(tier)}` : '';
  return `/api/stream-url?id=${id}${q}`;
}

/** Drive-backed tracks use this placeholder until `resolveDriveStreamUrl` runs. */
export function trackUsesDriveStreamProxy(track: { googleDriveUrl?: string; url?: string }): boolean {
  const r = track.googleDriveUrl || track.url || '';
  return r.includes('/api/drive-file');
}

const resolvedUrlByFileId = new Map<string, string>();
const inflightByFileId = new Map<string, Promise<string>>();

function cacheKey(fileId: string): string {
  const tier = publicAudioTier();
  return tier ? `${tier}:${fileId}` : fileId;
}

export async function resolveDriveStreamUrl(fileId: string): Promise<string> {
  const trimmed = fileId.trim();
  const fallback = `/api/drive-file?id=${encodeURIComponent(trimmed)}`;
  if (!trimmed) return fallback;

  const ck = cacheKey(trimmed);
  const hit = resolvedUrlByFileId.get(ck);
  if (hit) return hit;

  let pending = inflightByFileId.get(ck);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(buildStreamUrlPath(trimmed));
        if (!res.ok) {
          resolvedUrlByFileId.set(ck, fallback);
          return fallback;
        }
        const data = (await res.json()) as { url?: string; error?: string };
        if (typeof data.url === 'string' && data.url.length > 0) {
          resolvedUrlByFileId.set(ck, data.url);
          return data.url;
        }
      } catch {
        /* use fallback */
      }
      resolvedUrlByFileId.set(ck, fallback);
      return fallback;
    })();
    inflightByFileId.set(ck, pending);
    pending.finally(() => {
      if (inflightByFileId.get(ck) === pending) {
        inflightByFileId.delete(ck);
      }
    });
  }
  return pending;
}
