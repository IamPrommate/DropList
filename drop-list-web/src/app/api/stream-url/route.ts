import { Upload } from '@aws-sdk/lib-storage';
import { NextRequest, NextResponse } from 'next/server';
import {
  getR2BucketName,
  getR2PublicObjectUrl,
  getR2S3Client,
  isR2Configured,
  r2ObjectExists,
} from '@/app/lib/r2Client';
import { getR2ObjectKey, normalizeR2QualityTier } from '@/app/lib/r2StreamKey';

/** Drive download URL (same as `/api/drive-file`). */
const driveDownloadUrl = (fileId: string) =>
  `https://drive.google.com/uc?export=download&id=${fileId}`;

const DRIVE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function tierForRequest(req: NextRequest): string | null {
  const fromQuery = normalizeR2QualityTier(req.nextUrl.searchParams.get('q'));
  if (fromQuery) return fromQuery;
  return normalizeR2QualityTier(process.env.R2_AUDIO_TIER);
}

function proxyFallback(fileId: string) {
  return NextResponse.json({
    url: `/api/drive-file?id=${encodeURIComponent(fileId)}`,
    source: 'proxy' as const,
  });
}

/** Dedupe concurrent first-time uploads for the same R2 object key. */
const inflightUploads = new Map<string, Promise<void>>();

export const runtime = 'nodejs';

/** First-time Drive→R2 copy can exceed Hobby limits; Pro allows longer runs. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id?.trim()) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const fileId = id.trim();
  const tier = tierForRequest(req);
  const key = getR2ObjectKey(fileId, tier);

  if (!isR2Configured()) {
    return proxyFallback(fileId);
  }

  const bucket = getR2BucketName();
  if (!bucket) {
    return proxyFallback(fileId);
  }

  try {
    if (await r2ObjectExists(bucket, key)) {
      return NextResponse.json({
        url: getR2PublicObjectUrl(key),
        source: 'r2' as const,
        tier: tier ?? undefined,
      });
    }

    let upload = inflightUploads.get(key);
    if (!upload) {
      upload = (async () => {
        const driveRes = await fetch(driveDownloadUrl(fileId), {
          headers: { 'User-Agent': DRIVE_UA },
        });
        if (!driveRes.ok) {
          throw new Error(`Drive fetch failed: ${driveRes.status}`);
        }
        const body = driveRes.body;
        if (!body) {
          throw new Error('Drive response had no body');
        }
        const contentType = driveRes.headers.get('content-type') || 'audio/mpeg';

        const uploader = new Upload({
          client: getR2S3Client(),
          params: {
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: 'public, max-age=604800',
          },
        });
        await uploader.done();
      })();
      inflightUploads.set(key, upload);
      upload.finally(() => {
        if (inflightUploads.get(key) === upload) {
          inflightUploads.delete(key);
        }
      });
    }

    await upload;

    return NextResponse.json({
      url: getR2PublicObjectUrl(key),
      source: 'r2' as const,
      tier: tier ?? undefined,
    });
  } catch {
    return proxyFallback(fileId);
  }
}
