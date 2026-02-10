import type { DroplistData, PlayStatsData, PlayStatsEntry } from './types';

export const DROPLIST_DATA_VERSION = 1;

/** สร้างโครงไฟล์ droplist-data.json ว่าง (ทุกอย่างในไฟล์เดียว) */
export function createEmptyDroplistData(): DroplistData {
  return {
    version: DROPLIST_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    playCount: {},
  };
}

/** แปลงข้อมูลที่อ่านจาก Drive ให้เป็น DroplistData (รองรับของเก่าที่ใช้ plays) */
export function normalizeDroplistData(raw: unknown): DroplistData {
  if (raw && typeof raw === 'object' && 'playCount' in raw) {
    const o = raw as Record<string, unknown>;
    return {
      version: typeof o.version === 'number' ? o.version : DROPLIST_DATA_VERSION,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
      playCount: o.playCount && typeof o.playCount === 'object' && !Array.isArray(o.playCount) ? (o.playCount as DroplistData['playCount']) : {},
    };
  }
  if (raw && typeof raw === 'object' && 'plays' in raw) {
    const o = raw as Record<string, unknown>;
    return {
      version: typeof o.version === 'number' ? o.version : DROPLIST_DATA_VERSION,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
      playCount: o.plays && typeof o.plays === 'object' && !Array.isArray(o.plays) ? (o.plays as DroplistData['playCount']) : {},
    };
  }
  return createEmptyDroplistData();
}

/** merge playCount ภายใน DroplistData (ใช้ใน record play) */
function recordPlayInStats(
  data: PlayStatsData,
  trackKey: string,
  trackName: string
): PlayStatsData {
  const now = new Date().toISOString();
  const existing: PlayStatsEntry = data.plays[trackKey] ?? { count: 0 };
  return {
    ...data,
    updatedAt: now,
    plays: {
      ...data.plays,
      [trackKey]: {
        count: existing.count + 1,
        lastPlayedAt: now,
        name: trackName,
      },
    },
  };
}

/** บันทึกการฟัง 1 ครั้ง → อัปเดต playCount ใน DroplistData */
export function recordPlayInDroplistData(
  data: DroplistData,
  trackKey: string,
  trackName: string
): DroplistData {
  const updated = recordPlayInStats(
    { version: data.version, updatedAt: data.updatedAt, plays: data.playCount },
    trackKey,
    trackName
  );
  return {
    ...data,
    updatedAt: updated.updatedAt,
    playCount: updated.plays,
  };
}
