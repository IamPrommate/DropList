/** Rank keys match `pro_levels.rank` in the database (1–7). */
export type ProLevelRank = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PRO_LEVEL_MAX_RANK = 7;

export const PRO_LEVEL_RANKS: readonly ProLevelRank[] = [1, 2, 3, 4, 5, 6, 7] as const;

export function isProLevelRank(n: number): n is ProLevelRank {
  return n >= 1 && n <= PRO_LEVEL_MAX_RANK && Number.isInteger(n);
}

/** Free tier saved-playlist cap. */
export const SAVED_PLAYLIST_CAP_FREE = 1;
/** Pro: Bronze through Gold (ranks 1–3). */
export const SAVED_PLAYLIST_CAP_PRO_BASE = 5;
/** Pro: Sapphire through Amethyst (ranks 4–6). */
export const SAVED_PLAYLIST_CAP_PRO_SAPPHIRE = 6;
/** Pro: Emerald (rank 7). */
export const SAVED_PLAYLIST_CAP_PRO_EMERALD = 8;

/**
 * Max saved Drive playlists for the user’s plan + listening rank.
 * Free: 1. Pro: 5 (Bronze–Gold), 6 (Sapphire+), 8 (Emerald). Unknown rank on Pro → base cap.
 */
export function maxSavedPlaylists(isPro: boolean, proLevel: number | null | undefined): number {
  if (!isPro) return SAVED_PLAYLIST_CAP_FREE;
  if (proLevel != null && isProLevelRank(proLevel)) {
    if (proLevel >= 7) return SAVED_PLAYLIST_CAP_PRO_EMERALD;
    if (proLevel >= 4) return SAVED_PLAYLIST_CAP_PRO_SAPPHIRE;
    return SAVED_PLAYLIST_CAP_PRO_BASE;
  }
  return SAVED_PLAYLIST_CAP_PRO_BASE;
}

export const PRO_LEVEL_DISPLAY: Record<
  ProLevelRank,
  { name: string; badgeClass: string; hours: number; colorVar: string }
> = {
  1: { name: 'Bronze', badgeClass: 'pro-level-badge--bronze', hours: 0, colorVar: '#8a6b52' },
  2: { name: 'Silver', badgeClass: 'pro-level-badge--silver', hours: 15, colorVar: '#94a3b8' },
  3: { name: 'Gold', badgeClass: 'pro-level-badge--gold', hours: 45, colorVar: '#e8a231' },
  4: { name: 'Sapphire', badgeClass: 'pro-level-badge--sapphire', hours: 90, colorVar: '#0ea5e9' },
  5: { name: 'Ruby', badgeClass: 'pro-level-badge--ruby', hours: 160, colorVar: '#f43f5e' },
  6: { name: 'Amethyst', badgeClass: 'pro-level-badge--amethyst', hours: 240, colorVar: '#a855f7' },
  7: { name: 'Emerald', badgeClass: 'pro-level-badge--emerald', hours: 333, colorVar: '#10b981' },
};

export function proLevelLabel(rank: number | null | undefined): string | null {
  if (rank == null || !isProLevelRank(rank)) return null;
  return PRO_LEVEL_DISPLAY[rank].name;
}

export type LevelRow = {
  rank: number;
  name: string;
  listen_hours: number;
  total_plays: number;
};

export type ListenProgressSegment = {
  progressPct: number;
  nextName: string | null;
  nextListenHours: number | null;
  fromListenHours: number;
};

/** Progress toward the next tier’s listen_hours gate (0–100). Max tier → 100, next fields null. */
export function listenProgressTowardNext(
  rank: ProLevelRank,
  totalListenSeconds: number,
  levels: LevelRow[]
): ListenProgressSegment {
  const hours = totalListenSeconds / 3600;
  const sorted = [...levels].sort((a, b) => a.rank - b.rank);
  const next = sorted.find((l) => l.rank === rank + 1);
  if (!next) {
    const cur = sorted.find((l) => l.rank === rank);
    const lo = cur != null ? Number(cur.listen_hours) : 0;
    return { progressPct: 100, nextName: null, nextListenHours: null, fromListenHours: lo };
  }
  const cur = sorted.find((l) => l.rank === rank);
  const lo = cur != null ? Number(cur.listen_hours) : 0;
  const hi = Number(next.listen_hours);
  const span = Math.max(1e-6, hi - lo);
  const pct = Math.min(100, Math.max(0, ((hours - lo) / span) * 100));
  return { progressPct: pct, nextName: next.name, nextListenHours: hi, fromListenHours: lo };
}

/**
 * When the user has no stored rank (e.g. Free): same bar semantics using listen hours only —
 * progress in the interval before the next `listen_hours` threshold.
 */
export function listenProgressTowardNextByListening(
  totalListenSeconds: number,
  levels: LevelRow[]
): ListenProgressSegment {
  const hours = totalListenSeconds / 3600;
  const sorted = [...levels].sort((a, b) => a.rank - b.rank);
  const next = sorted.find((l) => Number(l.listen_hours) > hours);
  if (!next) {
    const last = sorted[sorted.length - 1];
    const lo = Number(last.listen_hours);
    return { progressPct: 100, nextName: null, nextListenHours: null, fromListenHours: lo };
  }
  const idx = sorted.indexOf(next);
  const lo = idx > 0 ? Number(sorted[idx - 1].listen_hours) : 0;
  const hi = Number(next.listen_hours);
  const span = Math.max(1e-6, hi - lo);
  const pct = Math.min(100, Math.max(0, ((hours - lo) / span) * 100));
  return { progressPct: pct, nextName: next.name, nextListenHours: hi, fromListenHours: lo };
}
