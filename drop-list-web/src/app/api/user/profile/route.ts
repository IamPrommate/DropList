import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { DISPLAY_NAME_MAX_LENGTH } from '@/app/lib/displayNameLimits';

/** Read-only profile fields from Supabase (plan, created_at). */
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('created_at, plan')
    .eq('id', token.userId)
    .single();

  if (error || !data) {
    console.error('[DropList] GET profile:', error);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const plan = (data.plan as 'free' | 'pro') ?? 'free';

  return NextResponse.json({
    createdAt: data.created_at ?? null,
    plan,
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
