// src/lib/types.ts
export type TrackType = {
    id: string;
    name: string;
    file?: File;
    url?: string; // for future backend-served files
  };
  
  export type PlaylistType = {
    id: string;
    name: string;
    tracks: TrackType[];
    currentIndex: number;
    isShuffled: boolean;
    volume: number; // 0..1
  };