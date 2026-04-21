import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';
import { isProLevelRank } from '@/app/lib/proLevels';
import { UserPlan } from '@/app/lib/userPlan';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!isStripeConfigured || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured', code: 'WEBHOOK_DISABLED' },
      { status: 503 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId && session.subscription) {
        const subscriptionId = session.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const { data: row } = await supabaseAdmin
          .from('users')
          .select('pro_level')
          .eq('id', userId)
          .single();
        const hasRank = row?.pro_level != null && isProLevelRank(Number(row.pro_level));
        await supabaseAdmin
          .from('users')
          .update({
            plan: UserPlan.Pro,
            stripe_subscription_id: subscriptionId,
            subscription_start: new Date(sub.start_date * 1000).toISOString(),
            subscription_end: null,
            ...(hasRank ? {} : { pro_level: 1 }),
          })
          .eq('id', userId);
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const customerId = invoice.customer as string;
      const subscriptionId: string | null = invoice.subscription ?? null;
      if (customerId && subscriptionId) {
        const { data: row } = await supabaseAdmin
          .from('users')
          .select('pro_level')
          .eq('stripe_customer_id', customerId)
          .single();
        const hasRank = row?.pro_level != null && isProLevelRank(Number(row.pro_level));
        await supabaseAdmin
          .from('users')
          .update({
            plan: UserPlan.Pro,
            stripe_subscription_id: subscriptionId,
            ...(hasRank ? {} : { pro_level: 1 }),
          })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription & {
        ended_at?: number | null;
        current_period_end?: number;
      };
      const customerId = subscription.customer as string;
      const endedAt = subscription.ended_at ?? subscription.current_period_end ?? Math.floor(Date.now() / 1000);
      await supabaseAdmin
        .from('users')
        .update({
          plan: UserPlan.Free,
          stripe_subscription_id: null,
          subscription_end: new Date(endedAt * 1000).toISOString(),
        })
        .eq('stripe_customer_id', customerId);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const customerId = invoice.customer as string;
      const subscriptionId: string | null = invoice.subscription ?? null;
      if (customerId && subscriptionId) {
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await supabaseAdmin
            .from('users')
            .update({ plan: UserPlan.Free })
            .eq('stripe_customer_id', customerId);
        }
        // status === 'past_due' → Stripe still retrying; keep Pro until final failure
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
