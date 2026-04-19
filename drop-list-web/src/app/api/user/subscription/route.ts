import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getStripe, isStripeConfigured } from '@/app/lib/stripe';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';

/** Stripe retrieve payload (snake_case); SDK types may not expose all fields on `Subscription`. */
type SubscriptionShape = {
  current_period_end: number;
  status: string;
  cancel_at_period_end?: boolean;
};

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('plan, stripe_subscription_id')
    .eq('id', token.userId)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const plan = parseUserPlan(user.plan);

  if (plan !== UserPlan.Pro || !user.stripe_subscription_id) {
    return NextResponse.json({
      plan,
      subscription: null,
    });
  }

  if (!isStripeConfigured) {
    return NextResponse.json({
      plan,
      subscription: null,
    });
  }

  try {
    const raw = await getStripe().subscriptions.retrieve(user.stripe_subscription_id);
    const sub = raw as unknown as SubscriptionShape;
    const currentPeriodEnd = sub.current_period_end;
    return NextResponse.json({
      plan: UserPlan.Pro,
      subscription: {
        status: sub.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      },
    });
  } catch (e) {
    console.error('[DropList] subscription GET:', e);
    return NextResponse.json({
      plan,
      subscription: null,
      billingError: 'Could not load billing details',
    });
  }
}
