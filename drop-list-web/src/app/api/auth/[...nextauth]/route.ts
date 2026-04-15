import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/app/lib/supabase';

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const baseUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

async function upsertUser(profile: { sub: string; email: string; name?: string; picture?: string }): Promise<'free' | 'pro'> {
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
      return existing.plan as 'free' | 'pro';
    }

    await supabaseAdmin.from('users').insert({
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      image: profile.picture,
      plan: 'free',
    });
    return 'free';
  } catch (err) {
    console.error('[DropList] upsertUser failed (Supabase may not be set up yet):', err);
    return 'free';
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
        const s = session as { name?: string | null };
        if (s.name !== undefined && s.name !== null) {
          token.name = s.name;
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
          .select('name, email, image, plan')
          .eq('id', googleProfile.sub)
          .single();

        if (row) {
          token.name = row.name ?? googleProfile.name ?? undefined;
          token.email = row.email ?? googleProfile.email ?? undefined;
          token.picture = row.image ?? googleProfile.picture ?? undefined;
          token.plan = (row.plan as 'free' | 'pro') ?? (token.plan as 'free' | 'pro') ?? 'free';
        } else {
          token.name = googleProfile.name;
          token.email = googleProfile.email;
          token.picture = googleProfile.picture;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      session.user.plan = (token.plan as 'free' | 'pro') ?? 'free';
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
