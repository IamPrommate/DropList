import { AsyncLocalStorage } from 'async_hooks';

type AuthRequestStore = {
  clientIp: string | null;
};

const storage = new AsyncLocalStorage<AuthRequestStore>();

/**
 * Wrap NextAuth route handlers so JWT callbacks can read the inbound request IP.
 * Vercel sets `x-forwarded-for` (client, proxy1, proxy2, ...).
 */
export function runWithAuthRequestContext<T>(clientIp: string | null, fn: () => T): T {
  return storage.run({ clientIp }, fn);
}

export function getAuthRequestClientIp(): string | null {
  return storage.getStore()?.clientIp ?? null;
}

/** First hop in X-Forwarded-For, or x-real-ip (trimmed). */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  return realIp || null;
}
