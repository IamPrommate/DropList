// src/app/page.tsx
'use client';

import { useCallback, useState } from 'react';
import AudioPlayer from './components/AudioPlayer';
import { TrackType } from './lib/types';
import { Divider} from 'antd';
import GoogleDrivePicker from './components/GoogleDrivePicker';
import Sidebar from './components/Sidebar';
import { 
  ShuffleState, 
  createInitialShuffleState, 
  getNextShuffleTrack, 
  getPrevShuffleTrack, 
  handleManualTrackSelection, 
  resetShuffleState 
} from '../utils/shuffle';
import { formatDuration } from '../utils/time';
import { parseTrackName, generateTrackId, filterAudioFiles, extractFolderName } from '../utils/track';
import './layout.scss';

export default function HomePage() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeated, setIsRepeated] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [trackDurations, setTrackDurations] = useState<Map<string, number>>(new Map());
  const [loadingDurations, setLoadingDurations] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Shuffle state
  const [shuffleState, setShuffleState] = useState<ShuffleState>({
    queue: [],
    queueIndex: 0,
    recentlyPlayed: []
  });

  const currentTrack = tracks[currentIndex];

  // Preload durations for all tracks (both local files and Google Drive URLs)
  const preloadTrackDurations = useCallback(async (tracks: TrackType[]) => {
    // Mark all tracks as loading
    const trackIds = tracks.map(track => track.id);
    setLoadingDurations(prev => {
      const updated = new Set(prev);
      trackIds.forEach(id => updated.add(id));
      return updated;
    });

    const durationPromises = tracks.map(track => {
      return new Promise<{ trackId: string; duration: number }>((resolve) => {
        let audioSrc: string | undefined;
        
        if (track.file) {
          // Local file - create blob URL
          audioSrc = URL.createObjectURL(track.file);
        } else if (track.googleDriveUrl) {
          // Google Drive URL - use directly
          audioSrc = track.googleDriveUrl;
        } else if (track.url) {
          // Generic URL
          audioSrc = track.url;
        }
        
        if (audioSrc) {
          const audio = new Audio();
          
          audio.addEventListener('loadedmetadata', () => {
            const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            // Only revoke blob URLs, not Drive URLs
            if (track.file && audioSrc?.startsWith('blob:')) {
              URL.revokeObjectURL(audioSrc);
            }
            resolve({ trackId: track.id, duration });
          });
          
          audio.addEventListener('error', () => {
            // Only revoke blob URLs, not Drive URLs
            if (track.file && audioSrc?.startsWith('blob:')) {
              URL.revokeObjectURL(audioSrc);
            }
            resolve({ trackId: track.id, duration: 0 });
          });
          
          audio.src = audioSrc;
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

    // Remove tracks from loading state
    setLoadingDurations(prev => {
      const updated = new Set(prev);
      trackIds.forEach(id => updated.delete(id));
      return updated;
    });
  }, []);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const audioFiles = filterAudioFiles(files);
    const next: TrackType[] = audioFiles.map((f) => ({
      id: generateTrackId(),
      name: f.name,
      file: f,
    }));
    setTracks(next);
    setCurrentIndex(0);
    setIsPlaying(next.length > 0);

    // Reset shuffle state when new tracks are loaded
    setShuffleState(resetShuffleState());

    // Preload durations for all tracks
    preloadTrackDurations(next);

    // Derive folder name when picking a directory (webkitRelativePath available)
    const first = files[0] as File & { webkitRelativePath?: string };
    const folderName = extractFolderName(first);
    setSelectedFolderName(folderName);
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
      const result = getNextShuffleTrack(tracks, currentIndex, shuffleState);
      if (result) {
        setCurrentIndex(result.nextIndex);
        setShuffleState(result.newState);
      }
    } else {
      const nextIndex = (currentIndex + 1) % tracks.length;
      setCurrentIndex(nextIndex);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled, currentIndex, shuffleState]);

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (isShuffled) {
      const result = getPrevShuffleTrack(tracks, currentIndex, shuffleState);
      if (result) {
        setCurrentIndex(result.prevIndex);
        setShuffleState(result.newState);
      }
    } else {
      const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
      setCurrentIndex(prevIndex);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled, currentIndex, shuffleState]);

  const handleShuffleToggle = useCallback(() => {
    setIsShuffled((s) => {
      const newShuffleState = !s;
      
      // If enabling shuffle, disable repeat and generate new queue
      if (newShuffleState) {
        setIsRepeated(false);
        const newShuffleState = createInitialShuffleState(tracks, currentIndex);
        setShuffleState(newShuffleState);
      } else {
        // If disabling shuffle, clear the queue and history
        setShuffleState(resetShuffleState());
      }
      return newShuffleState;
    });
  }, [tracks, currentIndex]);

  const handleRepeatToggle = useCallback(() => {
    setIsRepeated((r) => {
      const newRepeatState = !r;
      // If enabling repeat, disable shuffle and clear queue
      if (newRepeatState) {
        setIsShuffled(false);
        setShuffleState(resetShuffleState());
      }
      return newRepeatState;
    });
  }, []);

  const handleDurationLoaded = useCallback((trackId: string, duration: number) => {
    setTrackDurations(prev => new Map(prev.set(trackId, duration)));
  }, []);


  const totalDuration = tracks.reduce((total, track) => {
    const duration = trackDurations.get(track.id) || 0;
    return total + duration;
  }, 0);

  return (
    <main className="pageRoot">
      <div suppressHydrationWarning>
        <div className="app-layout">
          {/* Left Sidebar */}
          <Sidebar
            selectedFolderName={selectedFolderName}
            tracks={tracks}
            onFolderPick={handleFolderPick}
            onGoogleDrivePicked={(picked, folderName) => {
              setTracks(picked); // Replace tracks instead of concatenating
              setCurrentIndex(0);
              setIsPlaying(picked.length > 0);
              
              // Reset shuffle state when new tracks are loaded
              setShuffleState(resetShuffleState());
              
              // Set folder name if provided
              if (folderName) {
                setSelectedFolderName(folderName);
              }
              
              // Preload durations for Google Drive tracks
              preloadTrackDurations(picked);
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />

          {/* Main Content */}
          <div className="main-wrapper">
            <div className="container">
              <div className="header">
                {/* <button className="back-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 19l-7-7 7-7"></path>
                  </svg>
                </button> */}
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

              <div className={`main-content ${tracks.length === 0 ? 'centered' : ''}`}>
                <div className="album-art"></div>
                <div className="info-section">
                  <h1 className="title">{selectedFolderName || `Drop your playlist here!`}</h1>
                  <p className="subtitle">
                    {tracks.length > 0 
                      ? `${tracks.length} tracks, ${formatDuration(totalDuration)}`
                      : 'Ready to drop?'
                    }
                  </p>
                  <div className="buttons">
                    {tracks.length > 0 && (
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
                    )}
                    <button className="add-btn" onClick={handleFolderPick}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14m-7-7h14"></path>
                      </svg>
                      Add from local
                    </button>
                    <GoogleDrivePicker
                      onPicked={(picked, folderName) => {
                        setTracks(picked); // Replace tracks instead of concatenating
                        setCurrentIndex(0);
                        setIsPlaying(picked.length > 0);
                        
                        // Reset shuffle state when new tracks are loaded
                        setShuffleState(resetShuffleState());
                        
                        // Set folder name if provided
                        if (folderName) {
                          setSelectedFolderName(folderName);
                        }
                        
                        // Preload durations for Google Drive tracks
                        preloadTrackDurations(picked);
                      }}
                    />
                  </div>
                </div>
              </div>

              {currentTrack && (<Divider />)}

              <div className="playlist">
                {tracks.map((track, i) => {
                  const trackInfo = parseTrackName(track.name);
                  const duration = trackDurations.get(track.id) || 0;
                  return (
                    <div 
                      key={track.id}
                      className={`track-item ${i === currentIndex ? 'active' : ''}`}
                      onClick={() => {
                        // If shuffle is enabled, reset the queue when user manually selects a track
                        if (isShuffled) {
                          const newShuffleState = handleManualTrackSelection(tracks, i, shuffleState);
                          setShuffleState(newShuffleState);
                        }
                        
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
                        {loadingDurations.has(track.id) ? (
                          <div className="duration-spinner">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 11-6.219-8.56"/>
                            </svg>
                          </div>
                        ) : (
                          formatDuration(duration)
                        )}
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
            {currentTrack && (
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
                handleRepeatToggle={handleRepeatToggle}
                isShuffled={isShuffled}
                isRepeated={isRepeated}
                onDurationLoaded={handleDurationLoaded}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}