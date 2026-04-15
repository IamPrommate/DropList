import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';

/** GET: list all playlists for the current user */
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('playlists')
    .select('*')
    .eq('user_id', token.userId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlists: data ?? [] });
}

/** POST: save a new playlist */
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    folder_url?: string;
    folder_id?: string;
    name?: string;
    cover_url?: string | null;
  };

  if (!body.folder_id || !body.name) {
    return NextResponse.json({ error: 'folder_id and name are required' }, { status: 400 });
  }

  // Check if this folder is already saved
  const { data: existing } = await supabaseAdmin
    .from('playlists')
    .select('id')
    .eq('user_id', token.userId)
    .eq('folder_id', body.folder_id)
    .single();

  if (existing) {
    return NextResponse.json({ playlist: existing, alreadyExists: true });
  }

  const { data, error } = await supabaseAdmin
    .from('playlists')
    .insert({
      user_id: token.userId,
      folder_url: body.folder_url ?? '',
      folder_id: body.folder_id,
      name: body.name,
      cover_url: body.cover_url ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlist: data });
}

/** DELETE: remove a playlist */
export async function DELETE(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('id');

  if (!playlistId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('playlists')
    .delete()
    .eq('id', playlistId)
    .eq('user_id', token.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** PATCH: update playlist (e.g. cover_url) */
export async function PATCH(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    id?: string;
    cover_url?: string | null;
    name?: string;
  };

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.cover_url !== undefined) updates.cover_url = body.cover_url;
  if (body.name !== undefined) updates.name = body.name;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('playlists')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', token.userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlist: data });
}
