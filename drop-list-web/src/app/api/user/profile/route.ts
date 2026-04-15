import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { DISPLAY_NAME_MAX_LENGTH } from '@/app/lib/displayNameLimits';
import {
  isProLevelRank,
  listenProgressTowardNext,
  listenProgressTowardNextByListening,
  proLevelLabel,
  type LevelRow,
  type ProLevelRank,
} from '@/app/lib/proLevels';
import { UserPlan, parseUserPlan } from '@/app/lib/userPlan';

/** Read-only profile fields from Supabase (plan, created_at, listening rank & stats). */
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('created_at, plan, pro_level, total_listen_seconds, total_plays')
    .eq('id', token.userId)
    .single();

  if (error || !data) {
    console.error('[DropList] GET profile:', error);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const plan = parseUserPlan(data.plan);
  const rawLevel = data.pro_level;
  let proLevel: ProLevelRank | null =
    rawLevel != null && isProLevelRank(Number(rawLevel)) ? (Number(rawLevel) as ProLevelRank) : null;
  if (plan === UserPlan.Pro && proLevel == null) {
    proLevel = 1;
  }

  const totalListenSeconds = Number(data.total_listen_seconds) || 0;
  const totalPlays = Number(data.total_plays) || 0;

  const { data: levelRowsRaw, error: levelsErr } = await supabaseAdmin
    .from('pro_levels')
    .select('rank, name, listen_hours, total_plays')
    .order('rank', { ascending: true });

  if (levelsErr || !levelRowsRaw?.length) {
    console.error('[DropList] GET profile pro_levels:', levelsErr);
    if (proLevel == null) {
      return NextResponse.json({
        createdAt: data.created_at ?? null,
        plan,
        proLevel: null,
        totalListenSeconds,
        totalPlays,
        proLevelName: null,
        listenProgressPct: null,
        nextProLevelName: null,
        nextProLevelListenHours: null,
        listenProgressFromHours: null,
      });
    }
    return NextResponse.json({
      createdAt: data.created_at ?? null,
      plan,
      proLevel,
      totalListenSeconds,
      totalPlays,
      proLevelName: proLevelLabel(proLevel),
      listenProgressPct: 0,
      nextProLevelName: null,
      nextProLevelListenHours: null,
      listenProgressFromHours: null,
    });
  }

  const levelRows: LevelRow[] = levelRowsRaw.map((r) => ({
    rank: Number(r.rank),
    name: String(r.name),
    listen_hours: Number(r.listen_hours),
    total_plays: Number(r.total_plays),
  }));

  if (proLevel == null) {
    const seg = listenProgressTowardNextByListening(totalListenSeconds, levelRows);
    return NextResponse.json({
      createdAt: data.created_at ?? null,
      plan,
      proLevel: null,
      totalListenSeconds,
      totalPlays,
      proLevelName: null,
      listenProgressPct: seg.progressPct,
      nextProLevelName: seg.nextName,
      nextProLevelListenHours: seg.nextListenHours,
      listenProgressFromHours: seg.fromListenHours,
    });
  }

  const seg = listenProgressTowardNext(proLevel, totalListenSeconds, levelRows);

  return NextResponse.json({
    createdAt: data.created_at ?? null,
    plan,
    proLevel,
    totalListenSeconds,
    totalPlays,
    proLevelName: proLevelLabel(proLevel),
    listenProgressPct: seg.progressPct,
    nextProLevelName: seg.nextName,
    nextProLevelListenHours: seg.nextListenHours,
    listenProgressFromHours: seg.fromListenHours,
  });
}

export async function PATCH(req: NextRequest) {
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

  const nameRaw = typeof body === 'object' && body !== null && 'name' in body ? (body as { name: unknown }).name : undefined;
  if (typeof nameRaw !== 'string') {
    return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
  }

  const name = nameRaw.trim();
  if (name.length === 0) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from('users').update({ name }).eq('id', token.userId);

  if (error) {
    console.error('[DropList] PATCH profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ name });
}
