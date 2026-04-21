import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  applyBypassProUndo,
  applyBypassProUpgrade,
  isBypassStripeEnabled,
} from '@/app/lib/stripeBypassUpgrade';

/**
 * Development-only endpoint that instantly upgrades the signed-in user to Pro
 * (or downgrades back to Free) without going through Stripe.
 *
 * Only active when BYPASS_STRIPE=true in environment variables.
 * Never set this in production.
 *
 * POST /api/stripe/bypass-upgrade          → upgrades to Pro
 * POST /api/stripe/bypass-upgrade?undo=1   → reverts to Free
 */
export async function POST(req: NextRequest) {
  if (!isBypassStripeEnabled()) {
    return NextResponse.json(
      { error: 'This endpoint is disabled in production.' },
      { status: 403 }
    );
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = token.userId as string;
  const undo = req.nextUrl.searchParams.get('undo') === '1';

  const result = undo ? await applyBypassProUndo(userId) : await applyBypassProUpgrade(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    plan: undo ? 'free' : 'pro',
    message: undo
      ? 'Reverted to Free. Sign out and back in (or wait ~2 min) for the session to update.'
      : 'Upgraded to Pro. Sign out and back in (or wait ~2 min) for the session to update.',
  });
}
