const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Used when deciding if the access token should be refreshed (before expiry). */
export const GOOGLE_ACCESS_BUFFER_SEC = 300;

export type GoogleRefreshResult = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
};

/**
 * Exchange a Google OAuth refresh token for a new access token.
 * Used from API routes (`getToken` does not run the NextAuth `jwt` callback).
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleRefreshResult | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      console.error('[DropList] Google token refresh failed:', res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!data.access_token) return null;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn =
      typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
    return {
      accessToken: data.access_token,
      expiresAt: now + expiresIn,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    };
  } catch (e) {
    console.error('[DropList] Google token refresh error:', e);
    return null;
  }
}

/** Match `next-auth/jwt` `getToken` default for cookie name / `secure` flag. */
export function resolveNextAuthSecureCookie(): boolean {
  const url = process.env.NEXTAUTH_URL;
  if (typeof url === 'string') return url.startsWith('https://');
  return !!process.env.VERCEL;
}
