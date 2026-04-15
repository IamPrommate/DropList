import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/app/lib/supabase';
import { isProLevelRank } from '@/app/lib/proLevels';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const baseUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

async function upsertUser(profile: { sub: string; email: string; name?: string; picture?: string }): Promise<UserPlan> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', profile.sub)
      .single();

    if (existing) {
      // Do not overwrite `name` — user may set display name in Edit profile; keep syncing Google email/image.
      await supabaseAdmin
        .from('users')
        .update({ image: profile.picture, email: profile.email })
        .eq('id', profile.sub);
      return parseUserPlan(existing.plan);
    }

    await supabaseAdmin.from('users').insert({
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      image: profile.picture,
      plan: UserPlan.Free,
    });
    return UserPlan.Free;
  } catch (err) {
    console.error('[DropList] upsertUser failed (Supabase may not be set up yet):', err);
    return UserPlan.Free;
  }
}

const handler = NextAuth({
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
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as { name?: string | null; proLevel?: number | null };
        if (s.name !== undefined && s.name !== null) {
          token.name = s.name;
        }
        if (s.proLevel !== undefined) {
          token.proLevel = s.proLevel;
        }
      }

      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ?? undefined;

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

export { handler as GET, handler as POST };
