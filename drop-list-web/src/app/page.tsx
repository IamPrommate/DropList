// src/app/page.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import AudioPlayer from './components/AudioPlayer';
import { PlaylistType, TrackType } from './lib/types';
import { Layout, Button, Space, Switch, Typography, List , Divider} from 'antd';
import AlbumList from './components/AlbumList';
import GoogleDrivePicker from './components/GoogleDrivePicker';
import './layout.scss';
const { Sider, Content } = Layout;
const { Title, Text } = Typography;

function makeId() {
  return Math.random().toString(36).slice(2);
}

export default function HomePage() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [albums, setAlbums] = useState<string[]>([]);
  const [trackDurations, setTrackDurations] = useState<Map<string, number>>(new Map());

  const currentTrack = tracks[currentIndex];

  const playlist: PlaylistType = useMemo(
    () => ({
      id: 'local',
      name: 'Local Session',
      tracks,
      currentIndex,
      isShuffled,
      volume,
    }),
    [tracks, currentIndex, isShuffled, volume]
  );

  // Preload durations for all tracks
  const preloadTrackDurations = useCallback(async (tracks: TrackType[]) => {
    const durationPromises = tracks.map(track => {
      return new Promise<{ trackId: string; duration: number }>((resolve) => {
        if (track.file) {
          const audio = new Audio();
          const url = URL.createObjectURL(track.file);
          
          audio.addEventListener('loadedmetadata', () => {
            const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            URL.revokeObjectURL(url);
            resolve({ trackId: track.id, duration });
          });
          
          audio.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            resolve({ trackId: track.id, duration: 0 });
          });
          
          audio.src = url;
        } else {
          resolve({ trackId: track.id, duration: 0 });
        }
      });
    });

    const results = await Promise.all(durationPromises);
    const newDurations = new Map<string, number>();
    results.forEach(({ trackId, duration }) => {
      if (duration > 0) {
        newDurations.set(trackId, duration);
      }
    });
    
    setTrackDurations(prev => {
      const updated = new Map(prev);
      newDurations.forEach((duration, trackId) => {
        updated.set(trackId, duration);
      });
      return updated;
    });
  }, []);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: TrackType[] = Array.from(files)
      .filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name))
      .map((f) => ({
        id: makeId(),
        name: f.name,
        file: f,
      }));
    setTracks(next);
    setCurrentIndex(0);
    setIsPlaying(next.length > 0);

    // Preload durations for all tracks
    preloadTrackDurations(next);

    // Derive folder name when picking a directory (webkitRelativePath available)
    const first: any = files[0];
    const rel: string | undefined = first && (first.webkitRelativePath as string | undefined);
    if (rel && rel.includes('/')) {
      const top = rel.split('/')[0];
      setSelectedFolderName(top || null);
      if (top) {
        setAlbums((prev) => (prev.includes(top) ? prev : [...prev, top]));
      }
    } else {
      setSelectedFolderName(null);
    }
  }, [preloadTrackDurations]);

  // Directory picker (supported in Chromium-based browsers)
  const handleFolderPick = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac';
    input.onchange = () => handleFilesSelected(input.files);
    input.click();
  }, [handleFilesSelected]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (isShuffled) {
      const next = Math.floor(Math.random() * tracks.length);
      setCurrentIndex(next);
    } else {
      setCurrentIndex((i) => (i + 1) % tracks.length);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled]);

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (isShuffled) {
      const next = Math.floor(Math.random() * tracks.length);
      setCurrentIndex(next);
    } else {
      setCurrentIndex((i) => (i - 1 + tracks.length) % tracks.length);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled]);

  const handleShuffleToggle = useCallback(() => {
    setIsShuffled((s) => !s);
  }, []);

  const handleDurationLoaded = useCallback((trackId: string, duration: number) => {
    setTrackDurations(prev => new Map(prev.set(trackId, duration)));
  }, []);

  const formatDuration = (seconds: number) => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    // If 1 hour or more, show as H:MM:SS
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    // Otherwise show as MM:SS
    else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // Parse track name to extract title and artist
  const parseTrackName = (name: string) => {
    // Remove file extension first
    const nameWithoutExt = name.replace(/\.[^/.]+$/, '');
    
    // Try to match pattern: "Title (Artist)" or "Title(Artist)"
    const match = nameWithoutExt.match(/^(.+?)\s*\(([^)]+)\)/);
    if (match) {
      return {
        title: match[1].trim(),
        artist: match[2].trim()
      };
    }
    
    // If no parentheses, try to extract artist from common patterns
    // Look for patterns like "Title - Artist" or "Title by Artist"
    const dashMatch = nameWithoutExt.match(/^(.+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      return {
        title: dashMatch[1].trim(),
        artist: dashMatch[2].trim()
      };
    }
    
    const byMatch = nameWithoutExt.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return {
        title: byMatch[1].trim(),
        artist: byMatch[2].trim()
      };
    }
    
    return {
      title: nameWithoutExt,
      artist: 'Local File'
    };
  };

  const totalDuration = tracks.reduce((total, track) => {
    const duration = trackDurations.get(track.id) || 0;
    return total + duration;
  }, 0);

  return (
    <main className="pageRoot">
      <div suppressHydrationWarning>
        <div className="container">
          <div className="header">
            <button className="back-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div className="header-right">
              {/* <button className="header-btn">Listen</button>
              <button className="header-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{display: 'inline', marginRight: '4px'}}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                Manage
              </button> */}
              {/* <button className="header-btn" onClick={handleFolderPick}>+ Add</button> */}
              {/* <button className="share-btn">Share</button> */}
            </div>
          </div>

          <div className="main-content">
            <div className="album-art"></div>
            <div className="info-section">
              <h1 className="title">{selectedFolderName || 'DropList'}</h1>
              <p className="subtitle">{tracks.length} tracks, {formatDuration(totalDuration)}</p>
              <div className="buttons">
                <button 
                  className="play-btn"
                  onClick={() => {
                    if (tracks.length > 0) {
                      setIsPlaying(!isPlaying);
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    {isPlaying ? (
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"></path>
                    ) : (
                      <path d="M8 5v14l11-7z"></path>
                    )}
                  </svg>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button className="download-btn" onClick={handleFolderPick}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14m-7-7h14"></path>
                  </svg>
                  Add
                </button>
                <GoogleDrivePicker
                  onPicked={(picked) => {
                    console.log('Drive tracks picked:', picked);
                    setTracks(prev => [...prev, ...picked]);
                    setCurrentIndex(0);
                    setIsPlaying(picked.length > 0);
                  }}
                />
              </div>
            </div>
          </div>

          <Divider />

          <div className="playlist">
            {tracks.map((track, i) => {
              const trackInfo = parseTrackName(track.name);
              const duration = trackDurations.get(track.id) || 0;
              return (
                <div 
                  key={track.id}
                  className={`track-item ${i === currentIndex ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentIndex(i);
                    setIsPlaying(true);
                  }}
                >
                  <div className="track-number">{i + 1}</div>
                  <div className="track-info">
                    <div className="track-title">
                      {i === currentIndex && isPlaying && (
                        <div className="running-track-indicator"></div>
                      )}
                      {trackInfo.title}
                    </div>
                    <div className="track-artist">{trackInfo.artist}</div>
                  </div>
                  <div className="track-duration">
                    {formatDuration(duration)}
                  </div>
                  <div className="track-menu">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>

          {/* <div className="audio-options">
            <button className="audio-options-btn">
              <span>⚙️</span> Audio options
            </button>
          </div> */}
        </div>

        {/* Fixed bottom audio bar via SCSS */}
        <AudioPlayer
          track={currentTrack}
          volume={volume}
          onEnded={handleNext}
          onVolumeChange={setVolume}
          onPlayPauseToggle={() => setIsPlaying((p) => !p)}
          isPlaying={isPlaying}
          handlePrev={handlePrev}
          handleNext={handleNext}
          handleShuffleToggle={handleShuffleToggle}
          isShuffled={isShuffled}
          onDurationLoaded={handleDurationLoaded}
        />

      </div>
    </main>
  );
}