import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getStripe, isStripeConfigured } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';
import {
  applyBypassProUndo,
  BYPASS_STRIPE_SUB_ID,
  isBypassStripeEnabled,
} from '@/app/lib/stripeBypassUpgrade';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = req.headers.get('origin') || 'http://localhost:3000';

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', token.userId)
    .single();

  /**
   * Dev / preview on Vercel: Pro via BYPASS_STRIPE has no real Stripe customer — simulate “cancel” in DB.
   * Same UI as production (Manage billing → redirect).
   */
  if (isBypassStripeEnabled() && user?.stripe_subscription_id === BYPASS_STRIPE_SUB_ID) {
    const result = await applyBypassProUndo(token.userId as string);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      url: `${origin}/app?downgraded=true`,
      bypass: true,
    });
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: 'Billing is not enabled on this deployment', code: 'BILLING_DISABLED' },
      { status: 503 }
    );
  }

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/app?billing_return=true`,
  });

  return NextResponse.json({ url: session.url });
}
