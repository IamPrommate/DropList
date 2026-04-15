import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import type { ProLevelRank } from '@/app/lib/proLevels';
import { isProLevelRank } from '@/app/lib/proLevels';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';

const MAX_SECONDS_PER_REQUEST = 60;

type ProLevelRow = { rank: number; listen_hours: number; total_plays: number };

function computeRankForStats(
  levels: ProLevelRow[],
  totalListenSeconds: number,
  totalPlays: number
): ProLevelRank {
  const hours = totalListenSeconds / 3600;
  let best = 1 as ProLevelRank;
  for (const row of levels) {
    if (hours >= Number(row.listen_hours) && totalPlays >= row.total_plays) {
      if (isProLevelRank(row.rank) && row.rank > best) {
        best = row.rank;
      }
    }
  }
  return best;
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const secondsRaw = obj.seconds;
  const incrementPlay = obj.increment_play === true;

  const seconds =
    typeof secondsRaw === 'number' && Number.isFinite(secondsRaw)
      ? Math.max(0, Math.min(MAX_SECONDS_PER_REQUEST, Math.floor(secondsRaw)))
      : 0;

  if (!incrementPlay && seconds === 0) {
    return NextResponse.json({ error: 'seconds or increment_play required' }, { status: 400 });
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('plan, pro_level, total_listen_seconds, total_plays')
    .eq('id', token.userId)
    .single();

  if (userErr || !user) {
    console.error('[DropList] listen-time user:', userErr);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (parseUserPlan(user.plan) !== UserPlan.Pro) {
    return NextResponse.json({ error: 'Pro only' }, { status: 403 });
  }

  const { data: levels, error: levelsErr } = await supabaseAdmin
    .from('pro_levels')
    .select('rank, listen_hours, total_plays')
    .order('rank', { ascending: true });

  if (levelsErr || !levels?.length) {
    console.error('[DropList] listen-time pro_levels:', levelsErr);
    return NextResponse.json({ error: 'Levels not configured' }, { status: 500 });
  }

  const prevSeconds = Number(user.total_listen_seconds) || 0;
  const prevPlays = Number(user.total_plays) || 0;
  const prevLevelRaw = user.pro_level;
  const prevLevel =
    prevLevelRaw != null && isProLevelRank(Number(prevLevelRaw)) ? (Number(prevLevelRaw) as ProLevelRank) : 1;

  const newSeconds = prevSeconds + seconds;
  const newPlays = prevPlays + (incrementPlay ? 1 : 0);

  const computedRank = computeRankForStats(levels as ProLevelRow[], newSeconds, newPlays);
  const newLevel = Math.max(prevLevel, computedRank) as ProLevelRank;

  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({
      total_listen_seconds: newSeconds,
      total_plays: newPlays,
      pro_level: newLevel,
    })
    .eq('id', token.userId);

  if (updErr) {
    console.error('[DropList] listen-time update:', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    totalListenSeconds: newSeconds,
    totalPlays: newPlays,
    proLevel: newLevel,
  });
}
