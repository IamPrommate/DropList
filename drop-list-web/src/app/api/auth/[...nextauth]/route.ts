import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/app/lib/supabase';
import { isProLevelRank } from '@/app/lib/proLevels';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';
import { refreshGoogleAccessToken, GOOGLE_ACCESS_BUFFER_SEC } from '@/app/api/lib/google-oauth-refresh';
import {
  getAuthRequestClientIp,
  getClientIpFromHeaders,
  runWithAuthRequestContext,
} from '@/app/lib/authRequestContext';

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const baseUrl =
  process.env.NEXTAUTH_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

/** How often to re-read `plan` / `pro_level` from Supabase into the JWT (subscription is source of truth). */
const PLAN_DB_SYNC_INTERVAL_SEC = 120;

type JwtToken = Record<string, unknown> & {
  userId?: string;
  plan?: UserPlan;
  proLevel?: number;
  planSyncedAt?: number;
};

/**
 * Pro vs Free and listening rank must come from the database only (Stripe webhook, stats APIs).
 * Re-sync into the JWT so a stale cookie cannot keep Pro after cancel, and clients cannot self-grant Pro.
 */
async function syncPlanFromDatabase(token: JwtToken, force: boolean): Promise<void> {
  const userId = token.userId;
  if (!userId || typeof userId !== 'string') return;

  const now = Math.floor(Date.now() / 1000);
  const last = typeof token.planSyncedAt === 'number' ? token.planSyncedAt : 0;
  if (!force && last > 0 && now - last < PLAN_DB_SYNC_INTERVAL_SEC) return;

  try {
    const { data: row } = await supabaseAdmin
      .from('users')
      .select('plan, pro_level')
      .eq('id', userId)
      .single();

    if (!row) {
      token.plan = UserPlan.Free;
      token.proLevel = undefined;
      token.planSyncedAt = now;
      return;
    }

    token.plan = parseUserPlan((row.plan as string | null) ?? UserPlan.Free);
    const plan = token.plan;
    const rawPl = row.pro_level;
    const pl =
      typeof rawPl === 'number'
        ? rawPl
        : typeof rawPl === 'string' && /^\d+$/.test(rawPl)
          ? Number(rawPl)
          : null;

    if (pl != null && isProLevelRank(pl)) {
      token.proLevel = pl;
    } else if (plan === UserPlan.Pro) {
      token.proLevel = 1;
    } else {
      token.proLevel = undefined;
    }
    token.planSyncedAt = now;
  } catch (err) {
    console.error('[DropList] syncPlanFromDatabase failed:', err);
    token.plan = UserPlan.Free;
    token.proLevel = undefined;
    token.planSyncedAt = now;
  }
}

async function upsertUser(profile: { sub: string; email: string; name?: string; picture?: string }): Promise<UserPlan> {
  const clientIp = getAuthRequestClientIp();
  const nowIso = new Date().toISOString();

  try {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', profile.sub)
      .single();

    if (existing) {
      // Do not overwrite `name` — user may set display name in Edit profile; keep syncing Google email/image.
      const updatePayload: Record<string, unknown> = {
        image: profile.picture,
        email: profile.email,
      };
      if (clientIp) {
        updatePayload.last_seen_ip = clientIp;
        updatePayload.last_seen_at = nowIso;
      }
      await supabaseAdmin.from('users').update(updatePayload).eq('id', profile.sub);
      return parseUserPlan(existing.plan);
    }

    const insertPayload: Record<string, unknown> = {
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      image: profile.picture,
      plan: UserPlan.Free,
    };
    if (clientIp) {
      insertPayload.signup_ip = clientIp;
      insertPayload.last_seen_ip = clientIp;
      insertPayload.last_seen_at = nowIso;
    }

    await supabaseAdmin.from('users').insert(insertPayload);
    return UserPlan.Free;
  } catch (err) {
    console.error('[DropList] upsertUser failed (Supabase may not be set up yet):', err);
    return UserPlan.Free;
  }
}

const nextAuthHandler = NextAuth({
  providers: [
    ...(googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            authorization: {
              params: {
                scope: [
                  'openid',
                  'email',
                  'profile',
                  'https://www.googleapis.com/auth/drive.file',
                ].join(' '),
                prompt: 'consent',
                access_type: 'offline',
                response_type: 'code',
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, trigger, session }) {
      const t = token as JwtToken;

      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as { name?: string | null };
        if (s.name !== undefined && s.name !== null) {
          t.name = s.name;
        }
        await syncPlanFromDatabase(t, true);
      }

      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        const expiresInSec =
          typeof account.expires_in === 'number' && Number.isFinite(account.expires_in)
            ? account.expires_in
            : 3600;
        token.expiresAt =
          typeof account.expires_at === 'number' && account.expires_at > 0
            ? account.expires_at
            : Math.floor(Date.now() / 1000) + expiresInSec;

        const googleProfile = profile as { sub: string; email: string; name?: string; picture?: string };
        token.userId = googleProfile.sub;
        token.plan = await upsertUser(googleProfile);

        const { data: row } = await supabaseAdmin
          .from('users')
          .select('name, email, image, plan, pro_level')
          .eq('id', googleProfile.sub)
          .single();

        if (row) {
          token.name = row.name ?? googleProfile.name ?? undefined;
          token.email = row.email ?? googleProfile.email ?? undefined;
          token.picture = row.image ?? googleProfile.picture ?? undefined;
          token.plan = parseUserPlan(row.plan ?? token.plan ?? UserPlan.Free);
          const plan = token.plan;
          const pl = row.pro_level;
          if (pl != null && isProLevelRank(Number(pl))) {
            token.proLevel = Number(pl);
          } else if (plan === UserPlan.Pro) {
            token.proLevel = 1;
          } else {
            token.proLevel = undefined;
          }
        } else {
          token.name = googleProfile.name;
          token.email = googleProfile.email;
          token.picture = googleProfile.picture;
          token.proLevel = undefined;
        }
        t.planSyncedAt = Math.floor(Date.now() / 1000);
      } else if (token.refreshToken && typeof token.refreshToken === 'string') {
        const now = Math.floor(Date.now() / 1000);
        const exp = typeof token.expiresAt === 'number' ? token.expiresAt : 0;
        const needsRefresh = !token.accessToken || exp <= now + GOOGLE_ACCESS_BUFFER_SEC;
        if (needsRefresh) {
          const refreshed = await refreshGoogleAccessToken(token.refreshToken);
          if (refreshed) {
            token.accessToken = refreshed.accessToken;
            token.expiresAt = refreshed.expiresAt;
            if (refreshed.refreshToken) {
              token.refreshToken = refreshed.refreshToken;
            }
          } else {
            token.accessToken = undefined;
          }
        }
      }

      if (t.userId && !(account && profile)) {
        await syncPlanFromDatabase(t, false);
      }

      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      session.user.plan = parseUserPlan(token.plan ?? UserPlan.Free);
      const tl = token.proLevel;
      if (tl != null && isProLevelRank(Number(tl))) {
        session.user.proLevel = Number(tl);
      } else if (session.user.plan === UserPlan.Pro) {
        session.user.proLevel = 1;
      } else {
        session.user.proLevel = undefined;
      }
      if (token.name !== undefined) {
        session.user.name = token.name as string | null;
      }
      if (token.email !== undefined) {
        session.user.email = token.email as string | null;
      }
      if (token.picture !== undefined) {
        session.user.image = token.picture as string | null;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: '/',
  },
  secret,
  ...(baseUrl && { trustHost: true }),
});

async function authRouteHandler(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  return runWithAuthRequestContext(ip, () => nextAuthHandler(req));
}

export { authRouteHandler as GET, authRouteHandler as POST };
