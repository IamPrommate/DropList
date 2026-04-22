/**
 * Shared copy for Google Drive folder sharing requirements (UI + API error hints).
 */

export type DriveFolderErrorCode = 'NOT_PUBLIC' | 'NOT_FOUND' | 'EMPTY' | 'GENERIC';

export const GOOGLE_DRIVE_WEB_URL = 'https://drive.google.com/';

export const DRIVE_SHARE_STEPS = [
  'Open the folder in Google Drive.',
  'Click Share.',
  'Set General access to Anyone with the link (Viewer).',
  'Copy the folder link — DropList imports one shared folder at a time.',
] as const;

export const DRIVE_PERMISSION_BREAKS = [
  'Sharing is set back to Restricted or the link is revoked',
  'The folder or files are moved to Trash or deleted',
  'Audio files are moved or renamed out of the folder you linked',
  'The owner removes your access (for example on a shared drive)',
] as const;

export type ParsedDriveFolderError = {
  message: string;
  hint?: string;
};

/** Turn backend / network error strings into short user-facing text for the Drive picker. */
export function parseDriveFolderError(raw: string): ParsedDriveFolderError {
  const lower = raw.toLowerCase();
  if (lower.includes('tracks folder') && lower.includes('not found')) {
    return {
      message: raw,
      hint: 'Create that subfolder under your shared folder, or clear Tracks folder to use the folder root.',
    };
  }
  if (lower.includes('no files found') || lower.includes('not publicly accessible')) {
    return {
      message: "We couldn't find playable audio in this folder.",
      hint: 'Share the folder as Anyone with the link (Viewer) and make sure audio files are in the shared location.',
    };
  }
  if (lower.includes('not accessible with the link')) {
    return {
      message: raw,
      hint: 'In Google Drive: Share → General access → Anyone with the link (Viewer).',
    };
  }
  if (lower.includes('folder not found') || lower.includes('no longer valid')) {
    return {
      message: raw,
      hint: 'Confirm the folder still exists in Drive and paste an updated folder link.',
    };
  }
  if (lower.includes('folder id is required')) {
    return { message: raw };
  }
  return { message: raw };
}

export function driveAccessLostModalMessage(code: 'NOT_PUBLIC' | 'NOT_FOUND'): string {
  if (code === 'NOT_FOUND') {
    return 'This folder may have been deleted, moved, or the link is no longer valid. Open Google Drive, confirm the folder exists, and add it again with a fresh link if needed.';
  }
  return 'DropList can no longer read this folder. In Google Drive, set sharing to Anyone with the link (Viewer), then open your playlist again. If it still fails, remove and re-add the playlist with the updated link.';
}

/**
 * Map Google Drive API / Gaxios errors to a known code, or null if unknown (caller may retry HTML).
 */
export function classifyGoogleDriveApiError(err: unknown): 'NOT_PUBLIC' | 'NOT_FOUND' | null {
  const e = err as {
    code?: number | string;
    response?: { status?: number };
    errors?: Array<{ reason?: string; message?: string }>;
  };
  const status =
    typeof e.response?.status === 'number'
      ? e.response.status
      : typeof e.code === 'number'
        ? e.code
        : undefined;
  const reason = e.errors?.[0]?.reason;

  if (status === 404 || reason === 'notFound') return 'NOT_FOUND';
  if (
    status === 403 ||
    reason === 'forbidden' ||
    reason === 'fileNotFound' ||
    reason === 'insufficientFilePermissions' ||
    reason === 'authError'
  ) {
    return 'NOT_PUBLIC';
  }
  return null;
}
