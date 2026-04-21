import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getStripe, isStripeConfigured, STRIPE_PRICE_ID } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';
import { applyBypassProUpgrade, isBypassStripeEnabled } from '@/app/lib/stripeBypassUpgrade';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id, email, name')
    .eq('id', token.userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const origin = req.headers.get('origin') || 'http://localhost:3000';

  /** Same UI flow as Stripe (redirect to `url`), but updates DB locally — requires BYPASS_STRIPE=true. */
  if (isBypassStripeEnabled()) {
    const result = await applyBypassProUpgrade(token.userId as string);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      url: `${origin}/app?upgraded=true`,
      bypass: true,
    });
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: 'Billing is not enabled on this deployment', code: 'BILLING_DISABLED' },
      { status: 503 }
    );
  }

  let customerId = user.stripe_customer_id;

  const stripe = getStripe();

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: token.userId },
    });
    customerId = customer.id;

    await supabaseAdmin
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', token.userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/app?upgraded=true`,
    cancel_url: `${origin}/app?cancelled=true`,
    metadata: { userId: token.userId },
  });

  return NextResponse.json({ url: session.url });
}
