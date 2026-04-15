import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';

const DAILY_PLAY_LIMIT = 10;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ allowed: true, remaining: DAILY_PLAY_LIMIT, limit: DAILY_PLAY_LIMIT });
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('plan, daily_plays, daily_plays_date')
    .eq('id', token.userId)
    .single();

  if (!user) {
    return NextResponse.json({ allowed: true, remaining: DAILY_PLAY_LIMIT, limit: DAILY_PLAY_LIMIT });
  }

  if (parseUserPlan(user.plan) === UserPlan.Pro) {
    return NextResponse.json({ allowed: true, remaining: Infinity, limit: Infinity, plan: UserPlan.Pro });
  }

  const today = todayUTC();
  const plays = user.daily_plays_date === today ? user.daily_plays : 0;
  const remaining = Math.max(0, DAILY_PLAY_LIMIT - plays);

  return NextResponse.json({
    allowed: remaining > 0,
    remaining,
    limit: DAILY_PLAY_LIMIT,
    plan: UserPlan.Free,
  });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });

  if (!token?.userId) {
    // Not signed in — allow play but don't track (anonymous free usage)
    return NextResponse.json({ allowed: true, remaining: DAILY_PLAY_LIMIT, limit: DAILY_PLAY_LIMIT });
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('plan, daily_plays, daily_plays_date')
    .eq('id', token.userId)
    .single();

  if (!user) {
    return NextResponse.json({ allowed: true, remaining: DAILY_PLAY_LIMIT, limit: DAILY_PLAY_LIMIT });
  }

  if (parseUserPlan(user.plan) === UserPlan.Pro) {
    return NextResponse.json({ allowed: true, remaining: Infinity, limit: Infinity, plan: UserPlan.Pro });
  }

  const today = todayUTC();
  let plays = user.daily_plays_date === today ? user.daily_plays : 0;

  if (plays >= DAILY_PLAY_LIMIT) {
    return NextResponse.json({
      allowed: false,
      remaining: 0,
      limit: DAILY_PLAY_LIMIT,
      plan: UserPlan.Free,
    });
  }

  plays += 1;

  await supabaseAdmin
    .from('users')
    .update({ daily_plays: plays, daily_plays_date: today })
    .eq('id', token.userId);

  const remaining = Math.max(0, DAILY_PLAY_LIMIT - plays);

  return NextResponse.json({
    allowed: true,
    remaining,
    limit: DAILY_PLAY_LIMIT,
    plan: UserPlan.Free,
  });
}
