// src/app/page.tsx
'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import AudioPlayer from './components/AudioPlayer';
import PlaylistHeader from './components/PlaylistHeader';
import { TrackType, SavedPlaylist } from './lib/types';
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
import StageViewPanel from './components/StageViewPanel';
import SleepTimerControl from './components/SleepTimerControl';
import Link from 'next/link';
import { LoadingLink } from './components/NavigationLoading';
import { LogIn, LogOut, Zap, CreditCard, Shuffle, Music, Settings } from 'lucide-react';
import { useStageViewAutoHide } from './hooks/useStageViewAutoHide';
import UpgradeModal from './components/UpgradeModal';
import AlertModal from './components/AlertModal';
import Spinner from './components/Spinner';
import { findSavedPlaylistById, getPlaylistCoverUrl } from './lib/playlistCover';

enum KeyboardShortcuts {
  SPACE = 'Space',
  ARROW_LEFT = 'ArrowLeft',
  ARROW_RIGHT = 'ArrowRight',
  ARROW_UP = 'ArrowUp',
  ARROW_DOWN = 'ArrowDown',
  KEY_V = 'KeyV',
}

export default function HomePage() {
  const SIDEBAR_COLLAPSE_TRANSITION_MS = 180;
  const STAGE_VIEW_OPEN_DEBUG = true;
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeated, setIsRepeated] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sleepTimerEndAt, setSleepTimerEndAt] = useState<number | null>(null);
  const [sleepTimerExpired, setSleepTimerExpired] = useState(false);
  const [sleepTimerNow, setSleepTimerNow] = useState<number>(() => Date.now());
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
  // Stage View is disabled for now.
  const [isStageViewOpen, setIsStageViewOpen] = useState(false);
  const STAGE_VIEW_DISABLED = true;
  /** Drive folder ID when playlist is loaded from Google Drive (for saving stats into that folder) */
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string | null>(null);

  // --- Tier enforcement state ---
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState<'daily-limit' | 'track-select' | 'feature'>('feature');
  const [remainingPlays, setRemainingPlays] = useState<number>(10);
  const [playCountLoaded, setPlayCountLoaded] = useState(false);
  const [audioLoadErrorOpen, setAudioLoadErrorOpen] = useState(false);

  // --- Saved playlists ---
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  /** false until we've resolved what playlists the user has (or confirmed they're a guest). */
  const [savedPlaylistsHydrated, setSavedPlaylistsHydrated] = useState(false);
  /** true once the session effect has run at least once (avoids flash on first render). */
  const [sessionInitialized, setSessionInitialized] = useState(false);
  
  // Shuffle state
  const [shuffleState, setShuffleState] = useState<ShuffleState>({
    queue: [],
    queueIndex: 0,
    recentlyPlayed: []
  });

  const { data: session, status: sessionStatus } = useSession();
  const isPro = session?.user?.plan === 'pro';
  const isFree = !isPro;

  /** Same `cover_url` drives sidebar row + main album art (future: PATCH + setSavedPlaylists updates both). */
  const activeSavedPlaylist = useMemo(
    () => findSavedPlaylistById(savedPlaylists, activePlaylistId),
    [savedPlaylists, activePlaylistId]
  );
  const linkedAlbumCoverUrl = useMemo(
    () => getPlaylistCoverUrl(activeSavedPlaylist),
    [activeSavedPlaylist]
  );
  const [authDropdownOpen, setAuthDropdownOpen] = useState(false);
  const authDropdownRef = useRef<HTMLDivElement | null>(null);
  const stageViewOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTrack = tracks[currentIndex];
  const hasStageViewVideo = Boolean(currentTrack?.stageViewVideoUrl);
  const shouldAttemptShowStageView = hasStageViewVideo && isStageViewOpen;
  const { playlistRef, isStageViewAutoHidden } = useStageViewAutoHide({
    enabled: shouldAttemptShowStageView,
    layoutDependency: sidebarCollapsed,
  });
  // Keep layout reservation stable while Stage View mode is enabled.
  // Auto-hide should only toggle panel visibility, not container geometry.
  const shouldKeepStageViewLayoutReserved = shouldAttemptShowStageView;
  const logStageViewOpenDebug = useCallback(
    (message: string, payload?: Record<string, unknown>) => {
      if (!STAGE_VIEW_OPEN_DEBUG) return;
      if (payload) {
        console.log(`[StageViewOpenDebug] ${message}`, payload);
        return;
      }
      console.log(`[StageViewOpenDebug] ${message}`);
    },
    [STAGE_VIEW_OPEN_DEBUG]
  );

  // --- Fetch play count on session load ---
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    fetch('/api/play-count')
      .then(r => r.json())
      .then(data => {
        if (typeof data.remaining === 'number') setRemainingPlays(data.remaining);
        setPlayCountLoaded(true);
      })
      .catch(() => setPlayCountLoaded(true));
  }, [sessionStatus]);

  const checkAndDecrementPlay = useCallback(async (): Promise<boolean> => {
    if (isPro) return true;
    if (!session?.user) return true; // anonymous users get no server-side tracking
    try {
      const res = await fetch('/api/play-count', { method: 'POST' });
      const data = await res.json();
      setRemainingPlays(data.remaining ?? 0);
      if (!data.allowed) {
        setUpgradeModalReason('daily-limit');
        setUpgradeModalOpen(true);
        return false;
      }
      return true;
    } catch {
      return true; // allow on network error
    }
  }, [isPro, session?.user]);

  const showUpgradeFor = useCallback((reason: 'daily-limit' | 'track-select' | 'feature') => {
    setUpgradeModalReason(reason);
    setUpgradeModalOpen(true);
  }, []);

  /** Free signed-in users: block starting another track when daily quota is exhausted (plays are charged when audio actually starts). */
  const assertFreePlayQuota = useCallback((): boolean => {
    if (!isFree || !session?.user) return true;
    if (remainingPlays > 0) return true;
    setUpgradeModalReason('daily-limit');
    setUpgradeModalOpen(true);
    return false;
  }, [isFree, session?.user, remainingPlays]);

  const openAudioLoadErrorModal = useCallback(() => {
    setAudioLoadErrorOpen(true);
  }, []);

  // --- Saved playlists: fetch on login ---
  const fetchSavedPlaylists = useCallback(async () => {
    try {
      const res = await fetch('/api/playlists');
      const data = await res.json();
      if (data.playlists) setSavedPlaylists(data.playlists);
    } catch { /* ignore */ }
    finally {
      setSavedPlaylistsHydrated(true);
    }
  }, []);

  const hasRestoredPlaylist = useRef(false);

  useEffect(() => {
    if (sessionStatus === 'loading') {
      setIsPlaying(false);
      return;
    }

    setSessionInitialized(true);

    if (sessionStatus === 'unauthenticated') {
      hasRestoredPlaylist.current = false;
      setSavedPlaylists([]);
      setSavedPlaylistsHydrated(true);
      setIsPlaying(false);
      return;
    }
    if (sessionStatus === 'authenticated') {
      hasRestoredPlaylist.current = false;
      setSavedPlaylistsHydrated(false);
      setSavedPlaylists([]);
      setIsPlaying(false);
      fetchSavedPlaylists();
    }
  }, [sessionStatus, fetchSavedPlaylists]);

  /** Library list is reloading (e.g. after dev HMR / slow API); do not keep audio running over a loading shell */
  useEffect(() => {
    if (sessionStatus === 'authenticated' && !savedPlaylistsHydrated) {
      setIsPlaying(false);
    }
  }, [sessionStatus, savedPlaylistsHydrated]);

  /** Hard reload / bfcache restore can leave the tab thinking it should play while React rehydrates */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsPlaying(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const loadPlaylistFromDrive = useCallback(async (folderId: string): Promise<{
    tracks: TrackType[];
    folderName?: string;
  } | null> => {
    try {
      const res = await fetch('/api/drive-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      const data = await res.json();
      if (data.error || !data.files) return null;

      const { isAudioFile, FileType } = await import('./lib/common');

      const audioFiles = data.files.filter((f: { name: string; type?: string }) => isAudioFile(f.name) && f.type === FileType.AUDIO);

      // Always same-origin proxy: direct googleapis ?alt=media URLs reject browser <audio> (CORS).
      const buildUrl = (fileId: string) => `/api/drive-file?id=${fileId}`;

      const tracks: TrackType[] = audioFiles.map((file: { id: string; name: string }, i: number) => ({
        id: `${Date.now()}_${file.id}_${i}`,
        name: file.name,
        googleDriveUrl: buildUrl(file.id),
      }));

      return { tracks, folderName: data.folderName };
    } catch {
      return null;
    }
  }, []);

  const sleepTimerRemainingMs = sleepTimerEndAt ? Math.max(0, sleepTimerEndAt - sleepTimerNow) : 0;
  const isSleepTimerActive = sleepTimerEndAt !== null;
  const canUseSleepTimer = isPro && Boolean(currentTrack);

  const clearSleepTimer = useCallback(() => {
    setSleepTimerEndAt(null);
    setSleepTimerExpired(false);
  }, []);

  const maybeCancelExpiredSleepTimerOnManualTrackChange = useCallback(() => {
    // Requirement: if timer already expired and user manually changes track, go back to normal mode.
    if (sleepTimerExpired) {
      clearSleepTimer();
    }
  }, [sleepTimerExpired, clearSleepTimer]);

  const closeStageView = useCallback((reason = 'unknown') => {
    logStageViewOpenDebug('close requested', {
      reason,
      isStageViewOpen,
      sidebarCollapsed,
      hasPendingOpenTimeout: Boolean(stageViewOpenTimeoutRef.current),
    });

    if (stageViewOpenTimeoutRef.current) {
      clearTimeout(stageViewOpenTimeoutRef.current);
      stageViewOpenTimeoutRef.current = null;
      logStageViewOpenDebug('cleared pending open timeout while closing', { reason });
    }
    setIsStageViewOpen(false);
  }, [isStageViewOpen, logStageViewOpenDebug, sidebarCollapsed]);

  const openStageView = useCallback((reason = 'unknown') => {
    if (STAGE_VIEW_DISABLED) return;
    logStageViewOpenDebug('open requested', {
      reason,
      sidebarCollapsed,
      isStageViewOpen,
      hasPendingOpenTimeout: Boolean(stageViewOpenTimeoutRef.current),
    });

    if (stageViewOpenTimeoutRef.current) {
      clearTimeout(stageViewOpenTimeoutRef.current);
      stageViewOpenTimeoutRef.current = null;
      logStageViewOpenDebug('cleared previous pending open timeout', { reason });
    }

    // If Stage View is already open, avoid scheduling another open.
    // We only need to collapse the sidebar (if needed).
    if (isStageViewOpen) {
      if (!sidebarCollapsed) {
        setSidebarCollapsed(true);
        logStageViewOpenDebug('stage view already open, collapsing sidebar only', { reason });
      } else {
        logStageViewOpenDebug('stage view already open, no-op', { reason });
      }
      return;
    }

    if (sidebarCollapsed) {
      setIsStageViewOpen(true);
      logStageViewOpenDebug('opened immediately because sidebar already collapsed', { reason });
      return;
    }

    setSidebarCollapsed(true);
    logStageViewOpenDebug('sidebar collapse requested before opening stage view', { reason });
    stageViewOpenTimeoutRef.current = setTimeout(() => {
      setIsStageViewOpen(true);
      logStageViewOpenDebug('delayed open timeout fired', { reason });
      stageViewOpenTimeoutRef.current = null;
    }, SIDEBAR_COLLAPSE_TRANSITION_MS);
  }, [isStageViewOpen, logStageViewOpenDebug, sidebarCollapsed]);

  useEffect(() => {
    logStageViewOpenDebug('stage view state snapshot', {
      currentTrackId: currentTrack?.id ?? null,
      hasStageViewVideo,
      isStageViewOpen,
      sidebarCollapsed,
      shouldAttemptShowStageView,
      isStageViewAutoHidden,
      shouldKeepStageViewLayoutReserved,
    });
  }, [
    currentTrack?.id,
    hasStageViewVideo,
    isStageViewOpen,
    sidebarCollapsed,
    shouldAttemptShowStageView,
    isStageViewAutoHidden,
    shouldKeepStageViewLayoutReserved,
    logStageViewOpenDebug,
  ]);

  const closeAuthDropdown = useCallback(() => {
    setAuthDropdownOpen(false);
  }, []);

  const toggleAuthDropdown = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setAuthDropdownOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (!authDropdownOpen) return;
    const onDocPointerDown = (ev: MouseEvent) => {
      const root = authDropdownRef.current;
      if (root && !root.contains(ev.target as Node)) {
        setAuthDropdownOpen(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setAuthDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [authDropdownOpen]);

  useEffect(() => {
    return () => {
      if (stageViewOpenTimeoutRef.current) {
        clearTimeout(stageViewOpenTimeoutRef.current);
      }
    };
  }, []);

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

  const handleTrackPlayed = useCallback(
    async (playedTrack: TrackType) => {
      if (!isPro && session?.user) {
        const allowed = await checkAndDecrementPlay();
        if (!allowed) setIsPlaying(false);
        return;
      }
      if (!isPro || !session?.user || !currentDriveFolderId) return;
      const trackKey = getTrackCacheKey(playedTrack);
      const trackName = playedTrack.name;
      fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackKey,
          trackName,
          driveFolderId: currentDriveFolderId,
        }),
      }).catch(() => {});
    },
    [isPro, session?.user, currentDriveFolderId, getTrackCacheKey, checkAndDecrementPlay]
  );

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
            
            // Safari-specific improvements
            audio.preload = 'metadata';
            audio.crossOrigin = 'anonymous';
            
            // Set timeout to prevent hanging - longer timeout for Safari
            const timeout = setTimeout(() => {
              audio.src = '';
              if (track.file && audioSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(audioSrc);
              }
              resolve({ cacheKey, duration: 0 });
            }, 15000); // 15 second timeout for Safari compatibility
            
            audio.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
              // Only revoke blob URLs, not Drive URLs
              if (track.file && audioSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(audioSrc);
              }
              resolve({ cacheKey, duration });
            });
            
            audio.addEventListener('error', (e) => {
              clearTimeout(timeout);
              console.warn(`Failed to load duration for track ${track.name}:`, e);
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

  // --- Playlist management handlers ---
  const handleSelectPlaylist = useCallback(async (playlist: SavedPlaylist) => {
    if (loadingPlaylistId) return;
    if (activePlaylistId === playlist.id) return;

    setLoadingPlaylistId(playlist.id);
    const result = await loadPlaylistFromDrive(playlist.folder_id);
    setLoadingPlaylistId(null);

    if (!result || result.tracks.length === 0) return;

    setTracks(result.tracks);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setActivePlaylistId(playlist.id);
    setCurrentDriveFolderId(playlist.folder_id);
    setSelectedFolderName(result.folderName ?? playlist.name);
    if (isFree) {
      setIsShuffled(true);
      setShuffleState(createInitialShuffleState(result.tracks, -1));
    } else {
      setShuffleState(resetShuffleState());
    }

    preloadTrackDurations(result.tracks);
    preloadAudioFiles(result.tracks);
  }, [loadingPlaylistId, activePlaylistId, isFree, preloadTrackDurations, preloadAudioFiles, loadPlaylistFromDrive]);

  const handleDeletePlaylist = useCallback(async (playlistId: string) => {
    await fetch(`/api/playlists?id=${playlistId}`, { method: 'DELETE' });
    setSavedPlaylists(prev => prev.filter(p => p.id !== playlistId));
    if (activePlaylistId === playlistId) {
      setTracks([]);
      setCurrentIndex(-1);
      setIsPlaying(false);
      setActivePlaylistId(null);
      setCurrentDriveFolderId(null);
      setSelectedFolderName(null);
      localStorage.removeItem('droplist_last_playlist_id');
    }
  }, [activePlaylistId]);

  const handleEditCover = useCallback(async (playlistId: string, coverUrl: string | null) => {
    const res = await fetch('/api/playlists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: playlistId, cover_url: coverUrl }),
    });
    const data = await res.json();
    if (data.playlist) {
      setSavedPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, cover_url: coverUrl } : p));
    }
  }, [activePlaylistId]);

  // Auto-restore last playlist on login
  useEffect(() => {
    if (hasRestoredPlaylist.current) return;
    if (sessionStatus !== 'authenticated') return;
    if (savedPlaylists.length === 0) return;

    hasRestoredPlaylist.current = true;
    const lastId = localStorage.getItem('droplist_last_playlist_id');
    if (!lastId) return;

    const match = savedPlaylists.find(p => p.id === lastId);
    if (match) {
      handleSelectPlaylist(match);
    }
  }, [sessionStatus, savedPlaylists, handleSelectPlaylist]);

  // Persist active playlist to localStorage
  useEffect(() => {
    if (activePlaylistId) {
      localStorage.setItem('droplist_last_playlist_id', activePlaylistId);
    }
  }, [activePlaylistId]);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const audioFiles = filterAudioFiles(files);
    const next: TrackType[] = audioFiles.map((f) => ({
      id: generateTrackId(),
      name: f.name,
      file: f,
    }));
    setTracks(next);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentDriveFolderId(null); // Local playlist: no Drive folder for stats

    // Free users: always force shuffle on
    if (isFree) {
      setIsShuffled(true);
      setShuffleState(createInitialShuffleState(next, -1));
    } else {
      setShuffleState(resetShuffleState());
    }

    preloadTrackDurations(next);
    preloadAudioFiles(next);

    // Derive folder name when picking a directory (webkitRelativePath available)
    const first = files[0] as File & { webkitRelativePath?: string };
    const folderName = extractFolderName(first);
    setSelectedFolderName(folderName);
  }, [preloadTrackDurations, preloadAudioFiles, isFree]);

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

  const handleNext = useCallback(async () => {
    if (tracks.length === 0) return;

    if (!assertFreePlayQuota()) {
      setIsPlaying(false);
      return;
    }

    maybeCancelExpiredSleepTimerOnManualTrackChange();
    setPlaybackProgress(0);
    
    // Free users always shuffle; Pro users respect the toggle
    const shouldShuffle = isFree || isShuffled;
    if (shouldShuffle) {
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
  }, [tracks, isShuffled, isFree, currentIndex, shuffleState, maybeCancelExpiredSleepTimerOnManualTrackChange, assertFreePlayQuota]);

  const handlePrev = useCallback(async () => {
    if (tracks.length === 0) return;

    if (!assertFreePlayQuota()) {
      setIsPlaying(false);
      return;
    }

    maybeCancelExpiredSleepTimerOnManualTrackChange();
    setPlaybackProgress(0);
    const shouldShuffle = isFree || isShuffled;
    if (shouldShuffle) {
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
  }, [tracks, isShuffled, isFree, currentIndex, shuffleState, maybeCancelExpiredSleepTimerOnManualTrackChange, assertFreePlayQuota]);

  const handleTrackEnded = useCallback(() => {
    // Time is up: let current song finish, then stop and do not advance.
    if (sleepTimerExpired) {
      setIsPlaying(false);
      setPlaybackProgress(0);
      setCurrentIndex(-1); // clear active selection in playlist after sleep stop
      clearSleepTimer();
      return;
    }
    handleNext();
  }, [sleepTimerExpired, clearSleepTimer, handleNext]);

  const handleShuffleToggle = useCallback(() => {
    if (isFree) { showUpgradeFor('feature'); return; }
    setIsShuffled((s) => {
      const newShuffleState = !s;
      
      if (newShuffleState) {
        setIsRepeated(false);
        const newShuffleState = createInitialShuffleState(tracks, currentIndex);
        setShuffleState(newShuffleState);
      } else {
        setShuffleState(resetShuffleState());
      }
      return newShuffleState;
    });
  }, [tracks, currentIndex, isFree, showUpgradeFor]);

  const handleRepeatToggle = useCallback(() => {
    if (isFree) { showUpgradeFor('feature'); return; }
    setIsRepeated((r) => {
      const newRepeatState = !r;
      if (newRepeatState) {
        setIsShuffled(false);
        setShuffleState(resetShuffleState());
      }
      return newRepeatState;
    });
  }, [isFree, showUpgradeFor]);

  const handleDurationLoaded = useCallback((trackId: string, duration: number) => {
    setTrackDurations(prev => new Map(prev.set(trackId, duration)));
  }, []);


  const totalDuration = tracks.reduce((total, track) => {
    const cacheKey = getTrackCacheKey(track);
    const duration = trackDurations.get(cacheKey) || 0;
    return total + duration;
  }, 0);

  // Scroll-to-top button visibility 
  useEffect(() => {
    const handleScroll = () => {
      const halfHeight = (document.documentElement.scrollHeight - window.innerHeight) * 0.65;
      setShowScrollTop(window.scrollY > halfHeight);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sleep timer ticking
  useEffect(() => {
    if (!sleepTimerEndAt) return;
    const id = setInterval(() => setSleepTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndAt]);

  // Sleep timer expiration: allow current song to finish, then stop.
  useEffect(() => {
    if (!sleepTimerEndAt || sleepTimerExpired) return;
    if (sleepTimerNow >= sleepTimerEndAt) {
      if (!currentTrack) {
        clearSleepTimer();
        return;
      }
      setSleepTimerExpired(true);
    }
  }, [sleepTimerNow, sleepTimerEndAt, sleepTimerExpired, currentTrack, clearSleepTimer]);

  // Keyboard shortcuts (Pro-only except Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.code) {
        case KeyboardShortcuts.SPACE:
          e.preventDefault();
          if (tracks.length > 0) {
            setIsPlaying(!isPlaying);
          }
          break;
        case KeyboardShortcuts.ARROW_UP:
          if (isFree) return;
          e.preventDefault();
          setVolume(prev => Math.min(1, prev + 0.1));
          break;
        case KeyboardShortcuts.ARROW_DOWN:
          if (isFree) return;
          e.preventDefault();
          setVolume(prev => Math.max(0, prev - 0.1));
          break;
        // Stage View keyboard shortcut disabled
        // case KeyboardShortcuts.KEY_V:
        //   break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tracks.length, isPlaying, isFree, handlePrev, handleNext, currentTrack, isStageViewOpen, closeStageView, openStageView]);

  const isAuthPending = sessionStatus === 'loading' || !sessionInitialized;
  const isPlaylistCatalogLoading = sessionStatus === 'authenticated' && !savedPlaylistsHydrated;

  const mainContentLoading =
    isAuthPending ||
    isPlaylistCatalogLoading ||
    (loadingPlaylistId !== null && tracks.length === 0);

  return (
    <main className="pageRoot">
      {sessionStatus === 'loading' && (
        <div className="page-loading-overlay">
          <Spinner size={32} />
          <span>Loading…</span>
        </div>
      )}
      <div suppressHydrationWarning>
        <div className="app-layout">
          {/* Left Sidebar */}
          <Sidebar
            isLoggedIn={sessionStatus === 'authenticated'}
            isPro={isPro}
            savedPlaylists={savedPlaylists}
            activePlaylistId={activePlaylistId}
            tracks={tracks}
            loadingPlaylistId={loadingPlaylistId}
            loadingPlaylists={isAuthPending || isPlaylistCatalogLoading}
            onGoogleDrivePicked={async (picked, folderName, coverUrl, driveFolderId) => {
              setTracks(picked);
              setCurrentIndex(-1);
              setIsPlaying(false);
              setCurrentDriveFolderId(driveFolderId ?? null);

              if (isFree) {
                setIsShuffled(true);
                setShuffleState(createInitialShuffleState(picked, -1));
              } else {
                setShuffleState(resetShuffleState());
              }

              if (folderName) setSelectedFolderName(folderName);

              preloadTrackDurations(picked);
              preloadAudioFiles(picked);

              // Persist playlist to Supabase
              if (driveFolderId && session?.user) {
                try {
                  const res = await fetch('/api/playlists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      folder_url: `https://drive.google.com/drive/folders/${driveFolderId}`,
                      folder_id: driveFolderId,
                      name: folderName || 'Untitled Playlist',
                      cover_url: null,
                    }),
                  });
                  const data = await res.json();
                  if (data.playlist && !data.alreadyExists) {
                    setSavedPlaylists(prev => [...prev, data.playlist]);
                    setActivePlaylistId(data.playlist.id);
                  } else if (data.alreadyExists) {
                    setActivePlaylistId(data.playlist.id);
                  }
                } catch { /* ignore save errors */ }
              }
            }}
            onSelectPlaylist={handleSelectPlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onAddBlocked={() => showUpgradeFor('feature')}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => {
              setSidebarCollapsed(prev => {
                const next = !prev;
                if (!next) closeStageView('sidebar-expanded-manually');
                return next;
              });
            }}
          />

          {/* Main Content */}
          <div className="main-wrapper">
            {/* Auth – positioned absolute to main-wrapper top-right */}
            <div className="header-auth">
              {sessionStatus === 'loading' ? null : session ? (
                <div
                  ref={authDropdownRef}
                  className={`header-auth-logged-in${authDropdownOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="header-auth-avatar-wrap"
                    aria-expanded={authDropdownOpen}
                    aria-haspopup="menu"
                    onClick={toggleAuthDropdown}
                  >
                    {session.user?.image ? (
                      <img
                        src={session.user.image}
                        alt=""
                        className="header-auth-avatar"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // Replace broken image with placeholder
                          const target = e.currentTarget;
                          const placeholder = document.createElement('div');
                          placeholder.className = 'header-auth-avatar-placeholder';
                          placeholder.textContent = (session.user?.name || session.user?.email || '?').charAt(0).toUpperCase();
                          target.parentNode?.replaceChild(placeholder, target);
                        }}
                      />
                    ) : (
                      <div className="header-auth-avatar-placeholder">
                        {(session.user?.name || session.user?.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                  <div className="header-auth-dropdown" role="menu">
                    <div className="header-auth-dropdown-glow" aria-hidden />
                    <div className="header-auth-dropdown-header">
                      <div className="header-auth-dropdown-user">
                        <span className="header-auth-dropdown-name">
                          {session.user?.name || session.user?.email || 'Account'}
                        </span>
                        <span className={`header-auth-plan-badge ${isPro ? 'header-auth-plan-badge--pro' : 'header-auth-plan-badge--free'}`}>
                          {isPro ? 'Pro' : 'Free'}
                        </span>
                      </div>
                    </div>
                    <div className="header-auth-dropdown-body">
                      {isFree && (
                        <button
                          type="button"
                          className="header-auth-dropdown-item header-auth-dropdown-item--accent"
                          role="menuitem"
                          onClick={() => { closeAuthDropdown(); showUpgradeFor('feature'); }}
                        >
                          <span className="header-auth-dropdown-item-icon" aria-hidden>
                            <Zap size={15} strokeWidth={2} />
                          </span>
                          <span className="header-auth-dropdown-item-label">Upgrade to Pro</span>
                        </button>
                      )}
                      {isPro && (
                        <button
                          type="button"
                          className="header-auth-dropdown-item"
                          role="menuitem"
                          onClick={async () => {
                            closeAuthDropdown();
                            const res = await fetch('/api/stripe/portal', { method: 'POST' });
                            const data = await res.json();
                            if (data.url) window.location.href = data.url;
                          }}
                        >
                          <span className="header-auth-dropdown-item-icon" aria-hidden>
                            <CreditCard size={15} strokeWidth={1.75} />
                          </span>
                          <span className="header-auth-dropdown-item-label">Manage subscription</span>
                        </button>
                      )}
                      <LoadingLink
                        href="/settings"
                        className="header-auth-dropdown-item"
                        role="menuitem"
                        onClick={() => closeAuthDropdown()}
                      >
                        <span className="header-auth-dropdown-item-icon" aria-hidden>
                          <Settings size={15} strokeWidth={1.75} />
                        </span>
                        <span className="header-auth-dropdown-item-label">Settings</span>
                      </LoadingLink>
                    </div>
                    <div className="header-auth-dropdown-footer">
                      <button
                        type="button"
                        className="header-auth-dropdown-item header-auth-dropdown-item--signout"
                        role="menuitem"
                        onClick={() => {
                          closeAuthDropdown();
                          signOut();
                        }}
                      >
                        <span className="header-auth-dropdown-item-icon" aria-hidden>
                          <LogOut size={15} strokeWidth={2} />
                        </span>
                        <span className="header-auth-dropdown-item-label">Sign out</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="header-auth-btn header-auth-sign-in"
                  onClick={() => signIn('google')}
                >
                  <LogIn size={18} strokeWidth={2} />
                  Sign in with Google
                </button>
              )}
            </div>

            <div
              className={
                `container ${
                  shouldKeepStageViewLayoutReserved
                    ? 'container-stage-view-open'
                    : 'container-centered'
                }`
              }
            >
              {mainContentLoading ? (
                <div className="main-content-loading">
                  <Spinner size={32} />
                  <span>
                    {isAuthPending || isPlaylistCatalogLoading
                      ? 'Loading…'
                      : 'Loading playlist…'}
                  </span>
                </div>
              ) : (
              <>
              <div className="header">
                <div className="header-left">
                  <div className="image-toggle-control">
                    {isPro && (
                      <SleepTimerControl
                        isActive={isSleepTimerActive}
                        isExpiredWaiting={sleepTimerExpired}
                        remainingMs={sleepTimerRemainingMs}
                        disabled={!canUseSleepTimer}
                        onSelectMinutes={(minutes) => {
                          if (minutes === null) {
                            clearSleepTimer();
                            return;
                          }
                          const now = Date.now();
                          setSleepTimerNow(now);
                          setSleepTimerExpired(false);
                          setSleepTimerEndAt(now + minutes * 60 * 1000);
                        }}
                      />
                    )}
                    {isFree && session && tracks.length > 0 && (
                      <div className={`remaining-plays ${remainingPlays <= 3 ? 'remaining-plays-warn' : ''}`}>
                        <Shuffle size={12} />
                        <span className="remaining-plays-count">{remainingPlays}</span> plays left today
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <PlaylistHeader
                tracks={tracks}
                selectedFolderName={selectedFolderName}
                totalDuration={totalDuration}
                isPlaying={isPlaying}
                currentIndex={currentIndex}
                albumCoverUrl={linkedAlbumCoverUrl}
                showCoverImage={!!linkedAlbumCoverUrl}
                onPlayPause={() => {
                  if (tracks.length > 0) {
                    setIsPlaying(!isPlaying);
                  }
                }}
                onPlayFirst={async () => {
                  if (tracks.length > 0) {
                    if (!assertFreePlayQuota()) return;
                    maybeCancelExpiredSleepTimerOnManualTrackChange();
                    if (isFree) {
                      const randomIndex = Math.floor(Math.random() * tracks.length);
                      setCurrentIndex(randomIndex);
                      setShuffleState(createInitialShuffleState(tracks, randomIndex));
                    } else {
                      setCurrentIndex(0);
                    }
                    setIsPlaying(true);
                  }
                }}
              />

              {/* {currentTrack && (<Divider />)} */}

              <div className="playlist" ref={playlistRef}>
                {tracks.map((track, i) => {
                  const trackInfo = parseTrackName(track.name);
                  const cacheKey = getTrackCacheKey(track);
                  const duration = trackDurations.get(cacheKey) || 0;
                  return (
                    <div 
                      key={track.id}
                      className={`track-item ${i === currentIndex ? 'active' : ''} ${isFree ? 'track-item-locked' : ''}`}
                      onClick={() => {
                        if (isFree) {
                          showUpgradeFor('track-select');
                          return;
                        }
                        if (isShuffled) {
                          const newShuffleState = handleManualTrackSelection(tracks, i, shuffleState);
                          setShuffleState(newShuffleState);
                        }
                        maybeCancelExpiredSleepTimerOnManualTrackChange();
                        setPlaybackProgress(0);
                        setCurrentIndex(i);
                        setIsPlaying(true);
                      }}
                    >
                      <div className="track-number">{i + 1}</div>
                      <div className="track-thumb-image" aria-hidden>
                        <div className="track-thumb-placeholder">
                          <Music size={22} strokeWidth={1.75} />
                        </div>
                      </div>
                      <div className="track-splitter"></div>
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
                            <Spinner size={12} />
                          </div>
                        ) : trackDurations.has(cacheKey) ? (
                          formatDuration(duration)
                        ) : (
                          <div className="duration-spinner">
                            <Spinner size={12} />
                          </div>
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
              </>
              )}
            </div>

            {/* Stage View – disabled for now */}

            {/* Fixed bottom audio bar with smooth appearance */}
            <div className={`player-footer-transition ${currentTrack ? 'visible' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'}`}>
              {currentTrack && (
                <AudioPlayer
                  track={currentTrack}
                  volume={volume}
                  onEnded={handleTrackEnded}
                  onVolumeChange={setVolume}
                  onPlayPauseToggle={() => setIsPlaying((p) => !p)}
                  onIsPlayingChange={(v) => setIsPlaying(v)}
                  isPlaying={isPlaying}
                  handlePrev={handlePrev}
                  handleNext={handleNext}
                  handleShuffleToggle={handleShuffleToggle}
                  handleRepeatToggle={handleRepeatToggle}
                  isShuffled={isShuffled}
                  isRepeated={isRepeated}
                  onDurationLoaded={handleDurationLoaded}
                  getCachedBlobUrl={getCachedBlobUrl}
                  isStageViewOpen={false}
                  isSleepTimerExpired={sleepTimerExpired}
                  onTrackPlayed={handleTrackPlayed}
                  onPlaybackFailed={openAudioLoadErrorModal}
                  onProgressUpdate={setPlaybackProgress}
                  onToggleStageView={() => {}}
                  seekDisabled={isFree}
                  onSeekBlocked={() => showUpgradeFor('feature')}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll to top button */}
      <button
        className={`scroll-to-top ${showScrollTop ? 'visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      <AlertModal
        open={audioLoadErrorOpen}
        onClose={() => setAudioLoadErrorOpen(false)}
        title="Could not load audio"
        message="This track could not be played. Check your connection, confirm the file is shared correctly on Google Drive, then try again."
      />

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeModalReason}
        remainingPlays={remainingPlays}
      />
    </main>
  );
}