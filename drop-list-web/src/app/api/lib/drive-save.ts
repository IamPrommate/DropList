import { getToken, encode } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import {
  refreshGoogleAccessToken,
  resolveNextAuthSecureCookie,
  GOOGLE_ACCESS_BUFFER_SEC,
} from './google-oauth-refresh';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const SESSION_JWT_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/** เก็บทุกอย่างในไฟล์เดียว (play count, เวลาฟังรวม, liked ฯลฯ อนาคตเพิ่มใน type DroplistData) */
export const DROPLIST_DATA_FILENAME = 'droplist-data.json';

export type DriveAccessAuth = {
  accessToken: string | null;
  /**
   * When the Google access token was refreshed, re-encrypt the NextAuth session JWT and
   * attach it to the response (getToken in route handlers does not run the jwt callback).
   */
  applyRefreshedSessionCookie?: (res: NextResponse) => void;
};

function authSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
}

/**
 * Google OAuth access token for Drive, with refresh + session cookie update when needed.
 * API routes must call `applyRefreshedSessionCookie` on their `NextResponse` when defined.
 */
export async function getDriveAccessToken(req: NextRequest): Promise<DriveAccessAuth> {
  const secret = authSecret();
  if (!secret) return { accessToken: null };

  const secureCookie = resolveNextAuthSecureCookie();
  const token = (await getToken({ req, secret, secureCookie })) as JWT | null;
  if (!token) return { accessToken: null };

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof token.expiresAt === 'number' ? token.expiresAt : 0;
  const access = typeof token.accessToken === 'string' ? token.accessToken : undefined;
  const refresh = typeof token.refreshToken === 'string' ? token.refreshToken : undefined;

  const accessValid = Boolean(access && exp > now + GOOGLE_ACCESS_BUFFER_SEC);
  if (accessValid && access) {
    return { accessToken: access };
  }

  if (!refresh) {
    return { accessToken: null };
  }

  const refreshed = await refreshGoogleAccessToken(refresh);
  if (!refreshed) {
    return { accessToken: null };
  }

  const nextPayload: JWT = {
    ...token,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
  };

  const newJwt = await encode({
    token: nextPayload,
    secret,
    maxAge: SESSION_JWT_MAX_AGE_SEC,
  });

  const cookieName = secureCookie
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  return {
    accessToken: refreshed.accessToken,
    applyRefreshedSessionCookie(res: NextResponse) {
      res.cookies.set(cookieName, newJwt, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookie,
      });
    },
  };
}

/**
 * หาไฟล์จากชื่อในโฟลเดอร์
 */
async function findFileId(accessToken: string, parentFolderId: string, fileName: string): Promise<string | null> {
  const q = `name='${fileName}' and '${parentFolderId}' in parents and trashed=false`;
  const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

/**
 * อ่านเนื้อหา JSON จากไฟล์
 */
async function readJsonFile<T>(accessToken: string, fileId: string, defaultData: T): Promise<T> {
  const url = `${DRIVE_API}/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return defaultData;
  try {
    const data = (await res.json()) as T;
    return data;
  } catch {
    return defaultData;
  }
}

/**
 * สร้างไฟล์ JSON ใหม่ในโฟลเดอร์
 */
async function createJsonFile<T>(
  accessToken: string,
  parentFolderId: string,
  fileName: string,
  data: T
): Promise<string | null> {
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    mimeType: 'application/json',
  };
  const boundary = 'droplist_boundary';
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(data) +
    `\r\n--${boundary}--\r\n`;

  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    console.error('Drive create failed:', res.status, await res.text());
    return null;
  }
  const file = (await res.json()) as { id?: string };
  return file.id ?? null;
}

/**
 * อัปเดตเนื้อหาไฟล์ JSON
 */
async function updateJsonFile<T>(accessToken: string, fileId: string, data: T): Promise<boolean> {
  const res = await fetch(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

/**
 * ดึงหรือสร้างไฟล์ JSON ในโฟลเดอร์ Drive แล้วคืนค่า { fileId, data }
 * - ถ้ามีไฟล์อยู่แล้ว: อ่านเนื้อหาแล้วคืน
 * - ถ้าไม่มี: สร้างด้วย defaultData แล้วคืน
 */
export async function getOrCreateJsonFile<T>(
  accessToken: string,
  folderId: string,
  fileName: string,
  defaultData: T
): Promise<{ fileId: string; data: T } | null> {
  const fileId = await findFileId(accessToken, folderId, fileName);
  if (fileId) {
    const data = await readJsonFile(accessToken, fileId, defaultData);
    return { fileId, data };
  }
  const newId = await createJsonFile(accessToken, folderId, fileName, defaultData);
  if (!newId) return null;
  return { fileId: newId, data: defaultData };
}

/**
 * อ่าน → แก้ไข → บันทึกกลับ (merge pattern)
 * ใช้เมื่อต้องการอัปเดตข้อมูลในไฟล์ JSON โดยให้ mergeFn รับ data เดิมแล้วคืน data ใหม่
 */
export async function readMergeWriteJsonFile<T>(
  accessToken: string,
  folderId: string,
  fileName: string,
  defaultData: T,
  mergeFn: (current: T) => T
): Promise<{ ok: boolean; data: T }> {
  const result = await getOrCreateJsonFile(accessToken, folderId, fileName, defaultData);
  if (!result) return { ok: false, data: defaultData };
  const { fileId, data: current } = result;
  const nextData = mergeFn(current);
  const ok = await updateJsonFile(accessToken, fileId, nextData);
  return { ok, data: nextData };
}
