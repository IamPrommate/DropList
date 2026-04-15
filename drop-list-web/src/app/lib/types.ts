// src/lib/types.ts
export type TrackType = {
    id: string;
    name: string;
    file?: File;
    url?: string; // generic URL source
    googleDriveUrl?: string; // direct streaming URL from Google Drive
    stageViewVideoUrl?: string; // Google Drive URL for stage view video (per track)
  };
  
  export type PlaylistType = {
    id: string;
    name: string;
    tracks: TrackType[];
    currentIndex: number;
    isShuffled: boolean;
    isRepeated: boolean;
    volume: number; // 0..1
  };

  /** A playlist reference persisted in Supabase (not the actual tracks) */
  export type SavedPlaylist = {
    id: string;
    user_id: string;
    folder_url: string;
    folder_id: string;
    name: string;
    cover_url: string | null;
    created_at: string;
  };

  /** Per-track play count (หนึ่งแทร็กใน playCount) */
  export type PlayStatsEntry = {
    count: number;
    lastPlayedAt?: string; // ISO
    name?: string;
  };

  /** โครงเดิมของ play-only (ใช้ใน logic merge) */
  export type PlayStatsData = {
    version: number;
    updatedAt: string;
    plays: Record<string, PlayStatsEntry>;
  };

  /**
   * ไฟล์เดียวที่เก็บทุกอย่างที่ DropList บันทึกลง Drive
   * อนาคตเพิ่ม listeningTime, liked ฯลฯ ในนี้ได้
   */
  export type DroplistData = {
    version: number;
    updatedAt: string; // ISO
    playCount: Record<string, PlayStatsEntry>;
    // listeningTime?: { totalSeconds: number; ... };
    // liked?: { ... };
  };