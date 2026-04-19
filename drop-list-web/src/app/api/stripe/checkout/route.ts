import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getStripe, isStripeConfigured, STRIPE_PRICE_ID } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function POST(req: NextRequest) {
  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: 'Billing is not enabled on this deployment', code: 'BILLING_DISABLED' },
      { status: 503 }
    );
  }

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

  const origin = req.headers.get('origin') || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${origin}?upgraded=true`,
    cancel_url: `${origin}?cancelled=true`,
    metadata: { userId: token.userId },
  });

  return NextResponse.json({ url: session.url });
}
