// src/app/page.tsx
'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import { TrackType } from './lib/types';
import { Divider, Switch} from 'antd';
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
  // Initialize trackDurations from localStorage
  const [trackDurations, setTrackDurations] = useState<Map<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('trackDurations');
        if (cached) {
          const parsed = JSON.parse(cached);
          return new Map(Object.entries(parsed));
        }
      } catch (error) {
        console.warn('Failed to load cached durations:', error);
      }
    }
    return new Map();
  });
  const [loadingDurations, setLoadingDurations] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cachedImages, setCachedImages] = useState<Map<string, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [showArtistImages, setShowArtistImages] = useState<boolean>(true);
  
  // Shuffle state
  const [shuffleState, setShuffleState] = useState<ShuffleState>({
    queue: [],
    queueIndex: 0,
    recentlyPlayed: []
  });

  const currentTrack = tracks[currentIndex];

  // Save durations to localStorage cache
  const saveDurationsToCache = useCallback((durations: Map<string, number>) => {
    if (typeof window !== 'undefined') {
      try {
        const obj = Object.fromEntries(durations);
        localStorage.setItem('trackDurations', JSON.stringify(obj));
      } catch (error) {
        console.warn('Failed to save durations to cache:', error);
      }
    }
  }, []);

  // Generate cache key for tracks
  const getTrackCacheKey = useCallback((track: TrackType): string => {
    if (track.file) {
      // For local files, use name + size for uniqueness
      return `${track.name}-${track.file.size}`;
    } else if (track.googleDriveUrl) {
      // For Google Drive URLs, use the URL as key
      return track.googleDriveUrl;
    } else if (track.url) {
      // For generic URLs, use the URL as key
      return track.url;
    }
    // Fallback to track ID
    return track.id;
  }, []);

  // Audio cache for blob URLs - prevents memory leaks
  const audioCache = useRef<Map<string, string>>(new Map());
  
  // Get cached blob URL or create new one
  const getCachedBlobUrl = useCallback((track: TrackType): string | undefined => {
    if (!track.file) return undefined;
    
    const cacheKey = `${track.name}-${track.file.size}-${track.file.lastModified}`;
    
    if (!audioCache.current.has(cacheKey)) {
      const blobUrl = URL.createObjectURL(track.file);
      audioCache.current.set(cacheKey, blobUrl);
    }
    
    return audioCache.current.get(cacheKey);
  }, []);

  // Preload audio files for instant switching
  const preloadAudioFiles = useCallback(async (tracks: TrackType[]) => {
    const audioPromises = tracks
      .filter(track => track.file) // Only local files
      .map(track => {
        return new Promise<void>((resolve) => {
          const blobUrl = getCachedBlobUrl(track);
          
          if (!blobUrl) {
            resolve();
            return;
          }
          
          // Create audio element
          const audio = new Audio();
          
          // Add timeout to prevent hanging
          const timeout = setTimeout(() => {
            cleanup();
            resolve();
          }, 10000); // 10 second timeout
          
          // Cleanup function to prevent memory leaks
          const cleanup = () => {
            clearTimeout(timeout);
            audio.removeEventListener('canplaythrough', onCanPlayThrough);
            audio.removeEventListener('error', onError);
            audio.removeEventListener('loadstart', onLoadStart);
            // Don't revoke blob URL - it's cached and will be reused
            audio.src = '';
            audio.load(); // Clear the audio element
          };
          
          const onCanPlayThrough = () => {
            cleanup();
            resolve();
          };
          
          const onError = () => {
            cleanup();
            resolve();
          };
          
          const onLoadStart = () => {
            // Audio loading started successfully
          };
          
          // Add event listeners
          audio.addEventListener('canplaythrough', onCanPlayThrough);
          audio.addEventListener('error', onError);
          audio.addEventListener('loadstart', onLoadStart);
          
          // Set source and start loading
          audio.src = blobUrl;
          audio.load();
        });
      });

    await Promise.all(audioPromises);
  }, [getCachedBlobUrl]);

  // Cleanup audio cache on unmount
  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      // Clean up all cached blob URLs
      cache.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
      cache.clear();
    };
  }, []);

  // Preload and cache all artist images
  const preloadArtistImages = useCallback(async (tracks: TrackType[]) => {
    // Add all tracks with artist images to loading set
    const tracksWithImages = tracks.filter(track => track.artistImageUrl);
    setLoadingImages(prev => {
      const updated = new Set(prev);
      tracksWithImages.forEach(track => updated.add(track.id));
      return updated;
    });

    const imagePromises = tracksWithImages
      .map(async (track) => {
        return new Promise<{ trackId: string; imageUrl: string }>((resolve) => {
          const img = new Image();
          
          img.onload = () => {
            // Create a canvas to convert the image to a blob URL for caching
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx?.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
              if (blob) {
                const cachedUrl = URL.createObjectURL(blob);
                resolve({ trackId: track.id, imageUrl: cachedUrl });
              } else {
                resolve({ trackId: track.id, imageUrl: track.artistImageUrl! });
              }
            }, 'image/jpeg', 0.9);
          };
          
          img.onerror = () => {
            // If image fails to load, don't cache it
            resolve({ trackId: track.id, imageUrl: track.artistImageUrl! });
          };
          
          img.src = track.artistImageUrl!;
        });
      });

    const results = await Promise.all(imagePromises);
    const newCachedImages = new Map<string, string>();
    
    results.forEach(({ trackId, imageUrl }) => {
      newCachedImages.set(trackId, imageUrl);
    });
    
    setCachedImages(newCachedImages);
  }, []);

  // Preload durations for all tracks with batching and caching
  const preloadTrackDurations = useCallback(async (tracks: TrackType[]) => {
    // Filter tracks that don't already have durations and aren't currently loading
    const tracksToLoad = tracks.filter(track => {
      const cacheKey = getTrackCacheKey(track);
      return !trackDurations.has(cacheKey) && !loadingDurations.has(cacheKey);
    });

    if (tracksToLoad.length === 0) return;

    // Mark tracks as loading
    const cacheKeys = tracksToLoad.map(track => getTrackCacheKey(track));
    setLoadingDurations(prev => {
      const updated = new Set(prev);
      cacheKeys.forEach(key => updated.add(key));
      return updated;
    });

    // Load durations in batches of 3 with 100ms delay between batches
    const batchSize = 3;
    const batches = [];
    for (let i = 0; i < tracksToLoad.length; i += batchSize) {
      batches.push(tracksToLoad.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      const batchPromises = batch.map(track => {
        return new Promise<{ cacheKey: string; duration: number }>((resolve) => {
          const cacheKey = getTrackCacheKey(track);
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
            
            // Set timeout to prevent hanging
            const timeout = setTimeout(() => {
              audio.src = '';
              if (track.file && audioSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(audioSrc);
              }
              resolve({ cacheKey, duration: 0 });
            }, 10000); // 10 second timeout
            
            audio.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
              // Only revoke blob URLs, not Drive URLs
              if (track.file && audioSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(audioSrc);
              }
              resolve({ cacheKey, duration });
            });
            
            audio.addEventListener('error', () => {
              clearTimeout(timeout);
              // Only revoke blob URLs, not Drive URLs
              if (track.file && audioSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(audioSrc);
              }
              resolve({ cacheKey, duration: 0 });
            });
            
            audio.src = audioSrc;
          } else {
            resolve({ cacheKey, duration: 0 });
          }
        });
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Update durations progressively
      const newDurations = new Map<string, number>();
      batchResults.forEach(({ cacheKey, duration }) => {
        if (duration > 0) {
          newDurations.set(cacheKey, duration);
        }
      });
      
      setTrackDurations(prev => {
        const updated = new Map(prev);
        newDurations.forEach((duration, cacheKey) => {
          updated.set(cacheKey, duration);
        });
        return updated;
      });

      // Save to cache after each batch
      setTrackDurations(currentDurations => {
        saveDurationsToCache(currentDurations);
        return currentDurations;
      });

      // Remove batch from loading state
      setLoadingDurations(prev => {
        const updated = new Set(prev);
        batchResults.forEach(({ cacheKey }) => {
          updated.delete(cacheKey);
        });
        return updated;
      });

      // Add delay between batches (except for the last batch)
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }, [trackDurations, loadingDurations, getTrackCacheKey, saveDurationsToCache]);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    
    // Clean up previous cached images
    cachedImages.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setCachedImages(new Map());
    
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

    // Preload durations, audio files, and artist images for all tracks
    preloadTrackDurations(next);
    preloadAudioFiles(next);
    preloadArtistImages(next);

    // Derive folder name when picking a directory (webkitRelativePath available)
    const first = files[0] as File & { webkitRelativePath?: string };
    const folderName = extractFolderName(first);
    setSelectedFolderName(folderName);
  }, [preloadTrackDurations, preloadAudioFiles, preloadArtistImages]);

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
    const cacheKey = getTrackCacheKey(track);
    const duration = trackDurations.get(cacheKey) || 0;
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
              // Clean up previous cached images
              cachedImages.forEach(url => {
                if (url.startsWith('blob:')) {
                  URL.revokeObjectURL(url);
                }
              });
              setCachedImages(new Map());
              
              setTracks(picked); // Replace tracks instead of concatenating
              setCurrentIndex(0);
              setIsPlaying(picked.length > 0);
              
              // Reset shuffle state when new tracks are loaded
              setShuffleState(resetShuffleState());
              
              // Set folder name if provided
              if (folderName) {
                setSelectedFolderName(folderName);
              }
              
              // Preload durations, audio files, and artist images for Google Drive tracks
              preloadTrackDurations(picked);
              preloadAudioFiles(picked);
              preloadArtistImages(picked);
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
                <div className="album-art">
                  <div className="album-art-default"></div>
                </div>
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
                        // Clean up previous cached images
                        cachedImages.forEach(url => {
                          if (url.startsWith('blob:')) {
                            URL.revokeObjectURL(url);
                          }
                        });
                        setCachedImages(new Map());
                        
                        setTracks(picked); // Replace tracks instead of concatenating
                        setCurrentIndex(0);
                        setIsPlaying(picked.length > 0);
                        
                        // Reset shuffle state when new tracks are loaded
                        setShuffleState(resetShuffleState());
                        
                        // Set folder name if provided
                        if (folderName) {
                          setSelectedFolderName(folderName);
                        }
                        
                        // Preload durations, audio files, and artist images for Google Drive tracks
                        preloadTrackDurations(picked);
                        preloadAudioFiles(picked);
                        preloadArtistImages(picked);
                      }}
                    />
                  </div>
                </div>
              </div>

              {currentTrack && (<Divider />)}

              {tracks.length > 0 && (
                <div className="playlist-controls">
                  <div className="image-toggle-control">
                    <span className="toggle-label">Show artist image</span>
                    <Switch 
                      checked={showArtistImages}
                      onChange={setShowArtistImages}
                      size="small"
                    />
                  </div>
                </div>
              )}

              <div className="playlist">
                {tracks.map((track, i) => {
                  const trackInfo = parseTrackName(track.name);
                  const cacheKey = getTrackCacheKey(track);
                  const duration = trackDurations.get(cacheKey) || 0;
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
                      {showArtistImages && (
                        <div className="track-artist-image">
                          {track.artistImageUrl ? (
                            <>
                              <img 
                                src={track.artistImageUrl} 
                                alt={trackInfo.artist}
                                className="artist-thumbnail"
                                onLoad={() => {
                                  // Remove from loading set when image loads
                                  setLoadingImages(prev => {
                                    const updated = new Set(prev);
                                    updated.delete(track.id);
                                    return updated;
                                  });
                                }}
                                onError={() => {
                                  // Remove from loading set if image fails to load
                                  setLoadingImages(prev => {
                                    const updated = new Set(prev);
                                    updated.delete(track.id);
                                    return updated;
                                  });
                                }}
                              />
                              {loadingImages.has(track.id) && (
                                <div className="artist-image-spinner">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                  </svg>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="artist-placeholder">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      )}
                      {showArtistImages && <div className="track-splitter"></div>}
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
                        {loadingDurations.has(cacheKey) ? (
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
                cachedImages={cachedImages}
                getCachedBlobUrl={getCachedBlobUrl}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}