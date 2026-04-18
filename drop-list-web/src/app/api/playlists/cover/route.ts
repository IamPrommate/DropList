import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { PLAYLIST_COVERS_BUCKET } from '@/app/lib/playlistCoverStorage';

/** Cropped JPEG from client; allow a little headroom above typical 1024² output. */
const MAX_FILE_BYTES = 6 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  });
  if (!token?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const playlistIdRaw = formData.get('playlistId');
  const file = formData.get('file');

  if (typeof playlistIdRaw !== 'string' || !playlistIdRaw.trim()) {
    return NextResponse.json({ error: 'playlistId is required' }, { status: 400 });
  }
  const playlistId = playlistIdRaw.trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
  }

  if (file.type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Expected JPEG image' }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('playlists')
    .select('id')
    .eq('id', playlistId)
    .eq('user_id', token.userId)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  const objectPath = `${token.userId}/${playlistId}.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '120',
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .getPublicUrl(objectPath);

  // Same Storage path after upsert keeps an identical base URL; browsers/CDNs cache by URL.
  // Persist a unique query string so reload always requests a distinct URL while the object path stays the same.
  const basePublic = publicUrlData.publicUrl.split('?')[0];
  const cover_url = `${basePublic}?cb=${Date.now()}`;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('playlists')
    .update({ cover_url })
    .eq('id', playlistId)
    .eq('user_id', token.userId)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? 'Update failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ cover_url, playlist: updated });
}
