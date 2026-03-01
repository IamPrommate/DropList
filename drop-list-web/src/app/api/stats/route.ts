import { NextRequest, NextResponse } from 'next/server';
import { getDriveAccessToken, DROPLIST_DATA_FILENAME, readMergeWriteJsonFile } from '../lib/drive-save';
import { createEmptyDroplistData, normalizeDroplistData, recordPlayInDroplistData } from '@/app/lib/stats';

/**
 * POST: บันทึกการฟัง 1 ครั้ง → อัปเดต playCount ใน droplist-data.json (ไฟล์เดียว)
 * Body: trackKey, trackName, driveFolderId
 */
export async function POST(req: NextRequest) {
  const accessToken = await getDriveAccessToken(req);
  let body: { trackKey?: string; trackName?: string; driveFolderId?: string | null };
  try {
    body = (await req.json()) as { trackKey?: string; trackName?: string; driveFolderId?: string | null };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { trackKey, trackName, driveFolderId } = body;
  if (!trackKey || typeof trackName !== 'string') {
    return NextResponse.json(
      { error: 'trackKey and trackName required' },
      { status: 400 }
    );
  }

  if (!accessToken) {
    return NextResponse.json({ ok: true, source: 'local' });
  }

  if (!driveFolderId || typeof driveFolderId !== 'string') {
    return NextResponse.json({ error: 'driveFolderId required' }, { status: 400 });
  }

  const { ok, data } = await readMergeWriteJsonFile(
    accessToken,
    driveFolderId,
    DROPLIST_DATA_FILENAME,
    createEmptyDroplistData(),
    (current) => recordPlayInDroplistData(normalizeDroplistData(current), trackKey, trackName)
  );

  if (!ok) {
    return NextResponse.json({ error: 'Failed to save to Drive' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, playCount: data.playCount });
}
