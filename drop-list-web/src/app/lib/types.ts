// src/lib/types.ts
export type TrackType = {
    id: string;
    name: string;
    file?: File;
    url?: string; // generic URL source
    googleDriveUrl?: string; // direct streaming URL from Google Drive
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