import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';
import { isProLevelRank } from '@/app/lib/proLevels';
import { UserPlan } from '@/app/lib/userPlan';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
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
            stripe_subscription_id: session.subscription as string,
            ...(hasRank ? {} : { pro_level: 1 }),
          })
          .eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
        await supabaseAdmin
        .from('users')
        .update({ plan: UserPlan.Free, stripe_subscription_id: null })
        .eq('stripe_customer_id', customerId);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (customerId) {
        await supabaseAdmin
          .from('users')
          .update({ plan: UserPlan.Free })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
