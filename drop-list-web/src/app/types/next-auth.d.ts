import 'next-auth';
import type { UserPlan } from '@/app/lib/userPlan';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      plan?: UserPlan;
      /** Listening rank 1–7 from `users.pro_level` (kept after Pro ends); omit if never subscribed. */
      proLevel?: number | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userId?: string;
    plan?: UserPlan;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
    proLevel?: number | null;
  }
}
