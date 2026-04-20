import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

export { getR2ObjectKey, normalizeR2QualityTier } from './r2StreamKey';

let s3Client: S3Client | null = null;

/** All of these must be set for R2 caching; otherwise `/api/stream-url` falls back to `/api/drive-file`. */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL
  );
}

export function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME ?? '';
}

export function getR2PublicObjectUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  const path = key.startsWith('/') ? key : `/${key}`;
  return `${base}${path}`;
}

export function getR2S3Client(): S3Client {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID!;
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export async function r2ObjectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await getR2S3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    const meta = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (meta.name === 'NotFound' || meta.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}
