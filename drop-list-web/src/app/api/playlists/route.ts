import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { parseUserPlan, UserPlan } from '@/app/lib/userPlan';
import { maxSavedPlaylists } from '@/app/lib/proLevels';
import { PLAYLIST_NAME_MAX_LENGTH } from '@/app/lib/playlistNameLimits';

/** GET: list all playlists for the current user (Free: oldest saved only; extras stay in DB for Pro again) */
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('plan')
    .eq('id', token.userId)
    .single();

  let query = supabaseAdmin
    .from('playlists')
    .select('*')
    .eq('user_id', token.userId)
    .order('created_at', { ascending: true });

  if (parseUserPlan(userRow?.plan) === UserPlan.Free) {
    query = query.limit(1);
  }

  const { data, error } = await query;

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

  const postName =
    typeof body.name === 'string' ? body.name.trim() : '';
  if (!postName) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }
  if (postName.length > PLAYLIST_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `name must be at most ${PLAYLIST_NAME_MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Same folder may not use .single(): legacy duplicates would error; limit(1) is stable.
  const { data: existing } = await supabaseAdmin
    .from('playlists')
    .select('id')
    .eq('user_id', token.userId)
    .eq('folder_id', body.folder_id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ playlist: existing, alreadyExists: true });
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('plan, pro_level')
    .eq('id', token.userId)
    .single();

  const plan = parseUserPlan(userRow?.plan);
  const isPro = plan === UserPlan.Pro;
  const rawLevel = userRow?.pro_level;
  const proLevelNum =
    typeof rawLevel === 'number'
      ? rawLevel
      : typeof rawLevel === 'string' && /^\d+$/.test(rawLevel)
        ? Number(rawLevel)
        : null;
  const cap = maxSavedPlaylists(isPro, proLevelNum);

  const { count, error: countError } = await supabaseAdmin
    .from('playlists')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', token.userId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if ((count ?? 0) >= cap) {
    if (!isPro) {
      return NextResponse.json(
        {
          error:
            'Free plan allows one saved playlist. Delete one from your library or upgrade to Pro for more.',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error: `You can save up to ${cap} playlists on Pro at your listening rank (5 through Gold, 6 from Sapphire, 8 at Emerald). Delete one to add another, or earn a higher rank in Settings.`,
      },
      { status: 403 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('playlists')
    .insert({
      user_id: token.userId,
      folder_url: body.folder_url ?? '',
      folder_id: body.folder_id,
      name: postName,
      cover_url: body.cover_url ?? null,
    })
    .select()
    .single();

  if (error) {
    // Unique idx_playlists_user_id_folder_id: concurrent save of same folder
    if (error.code === '23505') {
      const { data: row } = await supabaseAdmin
        .from('playlists')
        .select('id')
        .eq('user_id', token.userId)
        .eq('folder_id', body.folder_id)
        .limit(1)
        .maybeSingle();
      if (row) {
        return NextResponse.json({ playlist: row, alreadyExists: true });
      }
    }
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
    audio_track_count?: number | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.cover_url !== undefined) updates.cover_url = body.cover_url;
  if (body.audio_track_count !== undefined) {
    if (body.audio_track_count !== null && (!Number.isFinite(body.audio_track_count) || body.audio_track_count < 0)) {
      return NextResponse.json({ error: 'audio_track_count must be a non-negative number or null' }, { status: 400 });
    }
    updates.audio_track_count = body.audio_track_count;
  }
  if (body.name !== undefined) {
    const trimmed =
      typeof body.name === 'string' ? body.name.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    if (trimmed.length > PLAYLIST_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `name must be at most ${PLAYLIST_NAME_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }
    updates.name = trimmed;
  }

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
