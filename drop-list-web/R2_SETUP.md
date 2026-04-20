# Cloudflare R2 (audio cache)

DropList can cache Google Drive audio in **Cloudflare R2** so playback hits R2 directly instead of streaming every byte through Vercel (which counts as **Fast Origin Transfer**).

## 1. Create a bucket

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create bucket** (e.g. `droplist-audio`).

## 2. Public access

1. Bucket → **Settings** → **Public access** → allow R2’s public hostname (e.g. `*.r2.dev`) **or** connect a custom domain.
2. Copy the **public bucket URL** (no trailing slash). Example: `https://pub-xxxxx.r2.dev`

This value is **`R2_PUBLIC_URL`**.

## 3. CORS

Bucket → **Settings** → **CORS policy**. Example (replace origins with your app):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR-PROJECT.vercel.app"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Required so `<audio>` and `fetch()` from the browser can read objects (including **Range** for seeking).

## 4. API token (S3-compatible)

1. R2 → **Manage R2 API Tokens** → **Create API token** with **Object Read & Write** on this bucket.
2. Note **Access Key ID**, **Secret Access Key**, and **Account ID** (from R2 overview URL or dashboard).

## 5. Environment variables

Add to `.env.local` and Vercel **Environment Variables**:

| Variable | Example |
|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | `droplist-audio` |
| `R2_PUBLIC_URL` | `https://pub-xxxxx.r2.dev` (no trailing slash) |

If any are missing, the app **falls back** to `/api/drive-file` only (unchanged behavior).

## 6. Vercel function duration (first play)

The first request for a track copies **Drive → R2** inside `/api/stream-url`. Large files may need a higher **`maxDuration`** on Vercel Pro; Hobby limits may cause slow uploads to fall back to the proxy.

**Playlist load** only stores the lightweight `/api/drive-file?…` proxy URL. **`/api/stream-url` runs when a track is actually played** (and optionally for the next 1–2 tracks as a background prefetch), so opening a folder with many files no longer fires dozens of long uploads at once.

## Security note

Public R2 URLs are **unguessable paths** (`audio/<driveFileId>`) but not secret. Anyone with the URL can download. This matches “anyone with the link” Drive sharing. For stricter models, use signed URLs or Cloudflare Access later.
