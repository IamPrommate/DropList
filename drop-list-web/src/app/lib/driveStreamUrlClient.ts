/**
 * Resolves a Google Drive file id to a playable URL.
 * When R2 is configured, `/api/stream-url` returns a public R2 URL (browser loads audio directly).
 * On failure or missing config, falls back to same-origin `/api/drive-file` proxy.
 *
 * In-memory cache + in-flight dedupe: repeat calls for the same id skip extra round-trips
 * (R2 is still “hot” on the server; this avoids redundant HeadObject+JSON work from the client).
 */
const resolvedUrlByFileId = new Map<string, string>();
const inflightByFileId = new Map<string, Promise<string>>();

export async function resolveDriveStreamUrl(fileId: string): Promise<string> {
  const trimmed = fileId.trim();
  const fallback = `/api/drive-file?id=${encodeURIComponent(trimmed)}`;
  if (!trimmed) return fallback;

  const hit = resolvedUrlByFileId.get(trimmed);
  if (hit) return hit;

  let pending = inflightByFileId.get(trimmed);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`/api/stream-url?id=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          resolvedUrlByFileId.set(trimmed, fallback);
          return fallback;
        }
        const data = (await res.json()) as { url?: string; error?: string };
        if (typeof data.url === 'string' && data.url.length > 0) {
          resolvedUrlByFileId.set(trimmed, data.url);
          return data.url;
        }
      } catch {
        /* use fallback */
      }
      resolvedUrlByFileId.set(trimmed, fallback);
      return fallback;
    })();
    inflightByFileId.set(trimmed, pending);
    pending.finally(() => {
      if (inflightByFileId.get(trimmed) === pending) {
        inflightByFileId.delete(trimmed);
      }
    });
  }
  return pending;
}
