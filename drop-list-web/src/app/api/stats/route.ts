import { NextRequest, NextResponse } from 'next/server';
import { getDriveAccessToken, DROPLIST_DATA_FILENAME, readMergeWriteJsonFile } from '../lib/drive-save';
import { createEmptyDroplistData, normalizeDroplistData, recordPlayInDroplistData } from '@/app/lib/stats';

/**
 * POST: บันทึกการฟัง 1 ครั้ง → อัปเดต playCount ใน droplist-data.json (ไฟล์เดียว)
 * Body: trackKey, trackName, driveFolderId
 */
export async function POST(req: NextRequest) {
  const { accessToken, applyRefreshedSessionCookie } = await getDriveAccessToken(req);

  const respond = (body: unknown, status = 200) => {
    const res = NextResponse.json(body, { status });
    applyRefreshedSessionCookie?.(res);
    return res;
  };

  let body: { trackKey?: string; trackName?: string; driveFolderId?: string | null };
  try {
    body = (await req.json()) as { trackKey?: string; trackName?: string; driveFolderId?: string | null };
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }
  const { trackKey, trackName, driveFolderId } = body;
  if (!trackKey || typeof trackName !== 'string') {
    return respond({ error: 'trackKey and trackName required' }, 400);
  }

  if (!accessToken) {
    return respond({ ok: true, source: 'local' });
  }

  if (!driveFolderId || typeof driveFolderId !== 'string') {
    return respond({ error: 'driveFolderId required' }, 400);
  }

  const { ok, data } = await readMergeWriteJsonFile(
    accessToken,
    driveFolderId,
    DROPLIST_DATA_FILENAME,
    createEmptyDroplistData(),
    (current) => recordPlayInDroplistData(normalizeDroplistData(current), trackKey, trackName)
  );

  if (!ok) {
    return respond({ error: 'Failed to save to Drive' }, 500);
  }

  return respond({ ok: true, playCount: data.playCount });
}
