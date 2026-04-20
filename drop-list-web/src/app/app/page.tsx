// src/app/app/page.tsx — main player at /app
'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useState, useRef, useEffect, useLayoutEffect, useMemo, startTransition, lazy, Suspense, memo } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import {
  proLevelLabel,
  isProLevelRank,
  PRO_LEVEL_DISPLAY,
  maxSavedPlaylists,
  type ProLevelRank,
} from '../lib/proLevels';
import { UserPlan, parseUserPlan } from '../lib/userPlan';
import type { SettingsProfileMeta, SettingsSubscriptionPayload } from '../lib/settingsTypes';
import AudioPlayer from '../components/AudioPlayer';
import PlaylistHeader from '../components/PlaylistHeader';
import { TrackType, SavedPlaylist } from '../lib/types';
import Sidebar from '../components/Sidebar';
const SettingsPanel = lazy(() => import('../components/SettingsPanel'));
import { 
  ShuffleState, 
  createInitialShuffleState, 
  getNextShuffleTrack, 
  getPrevShuffleTrack, 
  handleManualTrackSelection, 
  resetShuffleState 
} from '../../utils/shuffle';
import { formatDuration } from '../../utils/time';
import { parseTrackName, generateTrackId, filterAudioFiles, extractFolderName } from '../../utils/track';
import '../layout.scss';
import StageViewPanel from '../components/StageViewPanel';
import Link from 'next/link';
import { LoadingLink } from '../components/NavigationLoading';
import { LogIn, LogOut, Zap, CreditCard, Shuffle, Music, Settings } from 'lucide-react';
import ProBadge from '../components/ProBadge';
import FreeBadge from '../components/FreeBadge';
import { useStageViewAutoHide } from '../hooks/useStageViewAutoHide';
import UpgradeModal, { type UpgradeModalReason } from '../components/UpgradeModal';
import { isUpgradeEntrySnoozedForToday } from '../lib/upgradeEntrySnooze';
import { buildStreamUrlPath, resolveDriveStreamUrl, trackUsesDriveStreamProxy } from '../lib/driveStreamUrlClient';
import AlertModal from '../components/AlertModal';
import Spinner from '../components/Spinner';
import TrackItem from '../components/TrackItem';
import {
  findSavedPlaylistById,
  getPlaylistCoverUrl,
  playlistCoverUrlWithCacheBust,
} from '../lib/playlistCover';
import { PLAYLIST_NAME_MAX_LENGTH } from '../lib/playlistNameLimits';

enum KeyboardShortcuts {
  SPACE = 'Space',
  ARROW_LEFT = 'ArrowLeft',
  ARROW_RIGHT = 'ArrowRight',
  ARROW_UP = 'ArrowUp',
  ARROW_DOWN = 'ArrowDown',
  KEY_V = 'KeyV',
}

/** In-memory session cache for Drive folder listings. */
type CachedPlaylist = {
  tracks: TrackType[];
  folderName?: string;
  fetchedAt: number;
};

/** Distinguishes legacy playlists (omit API `tracksSubfolder`) from explicit root (`""`). */
function playlistContentCacheKey(folderId: string, tracksSubfolder: string | null | undefined) {
  return `${folderId}\t${tracksSubfolder == null ? '__legacy__' : tracksSubfolder}`;
}

function tracksListsEqualByDriveIds(a: TrackType[], b: TrackType[]): boolean {
  if (a.length !== b.length) return false;
  const idsA = [...a].map((t) => t.id).sort();
  const idsB = [...b].map((t) => t.id).sort();
  return idsA.every((id, i) => id === idsB[i]);
}

export default function HomePage() {
  const SIDEBAR_COLLAPSE_TRANSITION_MS = 180;
  const STAGE_VIEW_OPEN_DEBUG = true;
  const [tracks, setTracks] = useState<TrackType[]>([]);
  /** Audio queue (may differ from visible `tracks` when another playlist is still playing). */
  const [playbackTracks, setPlaybackTracks] = useState<TrackType[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  /** Saved playlist id for the current playback queue; null = local/import not tied to a row. */
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState<string | null>(null);
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
  const [upgradeModalReason, setUpgradeModalReason] = useState<UpgradeModalReason>('feature');
  const [remainingPlays, setRemainingPlays] = useState<number>(10);
  const [playCountLoaded, setPlayCountLoaded] = useState(false);
  const [audioLoadErrorOpen, setAudioLoadErrorOpen] = useState(false);
  const [playlistCapModalOpen, setPlaylistCapModalOpen] = useState(false);
  const [playlistCapModalMessage, setPlaylistCapModalMessage] = useState('');

  // --- Saved playlists ---
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  /** false until we've resolved what playlists the user has (or confirmed they're a guest). */
  const [savedPlaylistsHydrated, setSavedPlaylistsHydrated] = useState(false);
  /** true once the session effect has run at least once (avoids flash on first render). */
  const [sessionInitialized, setSessionInitialized] = useState(false);

  const playlistContentCache = useRef<Map<string, CachedPlaylist>>(new Map());
  /** For async playlist refresh: only apply updates if user is still on that playlist. */
  const activePlaylistIdRef = useRef<string | null>(null);
  const playbackPlaylistIdRef = useRef<string | null>(null);

  // Shuffle state for the playback queue (Free: forced shuffle uses this too)
  const [playbackShuffleState, setPlaybackShuffleState] = useState<ShuffleState>({
    queue: [],
    queueIndex: 0,
    recentlyPlayed: []
  });

  const { data: session, status: sessionStatus } = useSession();
  /**
   * Local display name after PATCH — avoids `updateSession({ name })`, which triggers a soft refresh and stops audio.
   */
  const [sessionNameOverride, setSessionNameOverride] = useState<string | null>(null);
  /**
   * Listening rank from `/api/listen-time` — avoids `updateSession({ proLevel })` for the same reason (soft refresh).
   */
  const [proLevelOverride, setProLevelOverride] = useState<number | null>(null);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setSessionNameOverride(null);
      setProLevelOverride(null);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionNameOverride != null && session?.user?.name === sessionNameOverride) {
      setSessionNameOverride(null);
    }
  }, [session?.user?.name, sessionNameOverride]);

  useEffect(() => {
    if (proLevelOverride != null && session?.user?.proLevel === proLevelOverride) {
      setProLevelOverride(null);
    }
  }, [session?.user?.proLevel, proLevelOverride]);

  const sessionForUi = useMemo(() => {
    if (!session) return null;
    const nameChanged = sessionNameOverride != null;
    const levelChanged = proLevelOverride != null;
    if (!nameChanged && !levelChanged) return session;
    return {
      ...session,
      user: {
        ...session.user,
        ...(nameChanged ? { name: sessionNameOverride } : {}),
        ...(levelChanged ? { proLevel: proLevelOverride } : {}),
      },
    };
  }, [session, sessionNameOverride, proLevelOverride]);

  const isPro = session?.user?.plan === UserPlan.Pro;
  const isFree = !isPro;

  const playlistAddAllowed = useMemo(() => {
    if (sessionStatus !== 'authenticated' || !session?.user) return false;
    const proLevel = proLevelOverride ?? session.user.proLevel;
    return (
      savedPlaylists.length <
      maxSavedPlaylists(session.user.plan === UserPlan.Pro, proLevel)
    );
  }, [sessionStatus, session?.user, session?.user?.plan, session?.user?.proLevel, proLevelOverride, savedPlaylists.length]);

  /** Signed-in Free users: entry promo (snooze “don’t show again today” in localStorage). */
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (!isFree) return;
    if (isUpgradeEntrySnoozedForToday()) return;
    setUpgradeModalReason('entry');
    setUpgradeModalOpen(true);
  }, [sessionStatus, isFree]);

  /** Same `cover_url` drives sidebar row + main album art (future: PATCH + setSavedPlaylists updates both). */
  const activeSavedPlaylist = useMemo(
    () => findSavedPlaylistById(savedPlaylists, activePlaylistId),
    [savedPlaylists, activePlaylistId]
  );
  const rawAlbumCoverUrl = useMemo(
    () => getPlaylistCoverUrl(activeSavedPlaylist),
    [activeSavedPlaylist]
  );
  /** Bumped on cover upload/remove so same Storage URL still refreshes `<img>`. */
  const [coverCacheRev, setCoverCacheRev] = useState(0);
  const bumpCoverCache = useCallback(() => setCoverCacheRev((r) => r + 1), []);
  const linkedAlbumCoverUrl = useMemo(
    () => playlistCoverUrlWithCacheBust(rawAlbumCoverUrl, coverCacheRev),
    [rawAlbumCoverUrl, coverCacheRev]
  );

  const [authDropdownOpen, setAuthDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMeta, setProfileMeta] = useState<SettingsProfileMeta | null>(null);
  const [profileMetaLoading, setProfileMetaLoading] = useState(false);
  const [subData, setSubData] = useState<SettingsSubscriptionPayload | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const authDropdownRef = useRef<HTMLDivElement | null>(null);
  const stageViewOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Wall clock when we last credited listen seconds (Pro only). */
  const listenWallClockRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  /** Same-frame as `isPlaying` (effects run too late for async handlers). */
  isPlayingRef.current = isPlaying;
  const currentTrack =
    playbackIndex >= 0 && playbackIndex < playbackTracks.length
      ? playbackTracks[playbackIndex]
      : undefined;

  /** Warm R2 for upcoming tracks (fire-and-forget; does not block UI). */
  useEffect(() => {
    if (playbackIndex < 0 || playbackTracks.length === 0) return;
    for (let offset = 1; offset <= 2; offset += 1) {
      const i = playbackIndex + offset;
      if (i >= playbackTracks.length) break;
      const t = playbackTracks[i];
      if (t?.id) {
        void fetch(buildStreamUrlPath(t.id));
      }
    }
  }, [playbackIndex, playbackTracks]);

  /** Index into visible `tracks` for header Play / Pause vs Play-first (detached = -1). */
  const headerPlaybackIndex =
    playbackPlaylistId != null && playbackPlaylistId === activePlaylistId ? playbackIndex : -1;
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

  const loadSubscription = useCallback(async () => {
    if (sessionStatus !== 'authenticated') return;
    setSubLoading(true);
    setSubData(null);
    try {
      const res = await fetch('/api/user/subscription');
      const data = (await res.json()) as SettingsSubscriptionPayload & { error?: string };
      if (!res.ok) {
        setSubData({
          plan: parseUserPlan(session?.user?.plan),
          subscription: null,
          billingError: data.error || 'Could not load billing details',
        });
        return;
      }
      setSubData({
        plan: parseUserPlan(String(data.plan)),
        subscription: data.subscription ?? null,
        billingError: data.billingError,
      });
    } catch {
      setSubData({
        plan: parseUserPlan(session?.user?.plan),
        subscription: null,
        billingError: 'Could not load billing details',
      });
    } finally {
      setSubLoading(false);
    }
  }, [sessionStatus, session?.user?.plan]);

  const loadProfileMeta = useCallback(async () => {
    if (sessionStatus !== 'authenticated') return;
    setProfileMetaLoading(true);
    try {
      const res = await fetch('/api/user/profile');
      const data = (await res.json()) as {
        createdAt?: string | null;
        plan?: string;
        proLevel?: number | null;
        totalListenSeconds?: number;
        totalPlays?: number;
        proLevelName?: string | null;
        listenProgressPct?: number | null;
        nextProLevelName?: string | null;
        nextProLevelListenHours?: number | null;
        listenProgressFromHours?: number | null;
        error?: string;
      };
      if (res.ok) {
        const plan = parseUserPlan(data.plan);
        setProfileMeta({
          createdAt: data.createdAt ?? null,
          plan,
          proLevel: typeof data.proLevel === 'number' ? data.proLevel : null,
          totalListenSeconds: typeof data.totalListenSeconds === 'number' ? data.totalListenSeconds : 0,
          totalPlays: typeof data.totalPlays === 'number' ? data.totalPlays : 0,
          proLevelName: typeof data.proLevelName === 'string' ? data.proLevelName : null,
          listenProgressPct: typeof data.listenProgressPct === 'number' ? data.listenProgressPct : null,
          nextProLevelName: typeof data.nextProLevelName === 'string' ? data.nextProLevelName : null,
          nextProLevelListenHours:
            typeof data.nextProLevelListenHours === 'number' ? data.nextProLevelListenHours : null,
          listenProgressFromHours:
            typeof data.listenProgressFromHours === 'number' ? data.listenProgressFromHours : null,
        });
      } else {
        setProfileMeta(null);
      }
    } catch {
      setProfileMeta(null);
    } finally {
      setProfileMetaLoading(false);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    void loadSubscription();
    void loadProfileMeta();
  }, [sessionStatus, loadSubscription, loadProfileMeta]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('settings') !== '1') return;
    startTransition(() => setSettingsOpen(true));
    params.delete('settings');
    const q = params.toString();
    window.history.replaceState(null, '', `/app${q ? `?${q}` : ''}${window.location.hash || ''}`);
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

  /** Persist audio file count from Drive (sidebar + next GET). */
  const updatePlaylistAudioTrackCount = useCallback(
    async (playlistId: string, count: number) => {
      const n = Math.max(0, Math.floor(count));
      setSavedPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, audio_track_count: n } : p))
      );
      if (sessionStatus !== 'authenticated') return;
      try {
        const res = await fetch('/api/playlists', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: playlistId, audio_track_count: n }),
        });
        const data = (await res.json()) as { playlist?: SavedPlaylist; error?: string };
        if (res.ok && data.playlist) {
          setSavedPlaylists((prev) =>
            prev.map((p) => (p.id === playlistId ? data.playlist! : p))
          );
        }
      } catch {
        /* ignore */
      }
    },
    [sessionStatus]
  );

  const hasRestoredPlaylist = useRef(false);
  /** Avoid re-requesting Drive summaries for the same playlist in one session. */
  const playlistSummaryAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activePlaylistIdRef.current = activePlaylistId;
  }, [activePlaylistId]);

  useEffect(() => {
    playbackPlaylistIdRef.current = playbackPlaylistId;
  }, [playbackPlaylistId]);

  useEffect(() => {
    if (sessionStatus === 'loading') {
      setIsPlaying(false);
      return;
    }

    setSessionInitialized(true);

    if (sessionStatus === 'unauthenticated') {
      hasRestoredPlaylist.current = false;
      playlistSummaryAttemptedRef.current.clear();
      setSavedPlaylists([]);
      setSavedPlaylistsHydrated(true);
      setIsPlaying(false);
      return;
    }
    if (sessionStatus === 'authenticated') {
      hasRestoredPlaylist.current = false;
      playlistSummaryAttemptedRef.current.clear();
      setSavedPlaylistsHydrated(false);
      setSavedPlaylists([]);
      setIsPlaying(false);
      fetchSavedPlaylists();
    }
  }, [sessionStatus, fetchSavedPlaylists]);

  /** After playlists load, prefetch track counts from Drive for rows missing `audio_track_count`. */
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !savedPlaylistsHydrated) return;
    const missing = savedPlaylists.filter((p) => p.audio_track_count == null);
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      await Promise.all(
        missing.map(async (pl) => {
          if (playlistSummaryAttemptedRef.current.has(pl.id)) return;
          playlistSummaryAttemptedRef.current.add(pl.id);
          try {
            const res = await fetch('/api/drive-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                folderId: pl.folder_id,
                summaryOnly: true,
                ...(pl.tracks_subfolder != null ? { tracksSubfolder: pl.tracks_subfolder } : {}),
              }),
            });
            const data = (await res.json()) as { audioTrackCount?: number };
            if (cancelled) return;
            if (typeof data.audioTrackCount !== 'number') {
              playlistSummaryAttemptedRef.current.delete(pl.id);
              return;
            }
            await updatePlaylistAudioTrackCount(pl.id, data.audioTrackCount);
          } catch {
            playlistSummaryAttemptedRef.current.delete(pl.id);
          }
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, savedPlaylistsHydrated, savedPlaylists, updatePlaylistAudioTrackCount]);

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

  type LoadPlaylistFromDriveOptions = { skipCache?: boolean };

  const loadPlaylistFromDrive = useCallback(
    async (
      folderId: string,
      tracksSubfolder: string | null | undefined,
      options?: LoadPlaylistFromDriveOptions
    ): Promise<{
      tracks: TrackType[];
      folderName?: string;
    } | null> => {
      const cacheKey = playlistContentCacheKey(folderId, tracksSubfolder);
      if (!options?.skipCache) {
        const cached = playlistContentCache.current.get(cacheKey);
        if (cached) {
          return {
            tracks: cached.tracks.map((t) => ({ ...t })),
            folderName: cached.folderName,
          };
        }
      }

      try {
        const body: Record<string, unknown> = { folderId };
        if (tracksSubfolder != null) {
          body.tracksSubfolder = tracksSubfolder;
        }
        const res = await fetch('/api/drive-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error || !data.files) return null;

        const { isAudioFile, FileType } = await import('../lib/common');

        const audioFiles = data.files.filter(
          (f: { name: string; type?: string }) => isAudioFile(f.name) && f.type === FileType.AUDIO
        );

        // Proxy URL only here — R2 is resolved lazily in AudioPlayer (one track at a time).
        const tracks: TrackType[] = audioFiles.map((file: { id: string; name: string }) => ({
          id: file.id,
          name: file.name,
          googleDriveUrl: `/api/drive-file?id=${encodeURIComponent(file.id)}`,
        }));

        const folderName: string | undefined = data.folderName;
        playlistContentCache.current.set(cacheKey, {
          tracks,
          folderName,
          fetchedAt: Date.now(),
        });

        return { tracks, folderName };
      } catch {
        return null;
      }
    },
    []
  );

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

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const handleNameSaved = useCallback((name: string) => setSessionNameOverride(name), []);
  const refreshProfile = useCallback(() => void loadProfileMeta(), [loadProfileMeta]);

  const togglePlayPause = useCallback(() => setIsPlaying((p) => !p), []);
  const handleIsPlayingChange = useCallback((v: boolean) => setIsPlaying(v), []);
  const noopToggleStageView = useCallback(() => {}, []);
  const handleSeekBlocked = useCallback(() => showUpgradeFor('feature'), [showUpgradeFor]);

  const handleTrackClick = useCallback(
    (index: number) => {
      if (isFree) {
        showUpgradeFor('track-select');
        return;
      }
      if (isShuffled) {
        const newShuffleState = handleManualTrackSelection(tracks, index, playbackShuffleState);
        setPlaybackShuffleState(newShuffleState);
      }
      const t = tracks[index];
      if (t?.id && trackUsesDriveStreamProxy(t)) {
        void resolveDriveStreamUrl(t.id);
      }
      maybeCancelExpiredSleepTimerOnManualTrackChange();
      setPlaybackProgress(0);
      setPlaybackTracks(tracks);
      setPlaybackPlaylistId(activePlaylistId);
      setPlaybackIndex(index);
      setIsPlaying(true);
    },
    [
      isFree,
      isShuffled,
      tracks,
      playbackShuffleState,
      activePlaylistId,
      showUpgradeFor,
      maybeCancelExpiredSleepTimerOnManualTrackChange,
    ]
  );

  const toggleAuthDropdown = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    startTransition(() => {
      setAuthDropdownOpen((open) => !open);
    });
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

  // Pro: credit wall-clock listen time every 30s while playing; flush on pause.
  useEffect(() => {
    if (!isPro || sessionStatus !== 'authenticated') return;
    if (!isPlaying) return;
    listenWallClockRef.current = Date.now();
  }, [isPro, sessionStatus, isPlaying]);

  useEffect(() => {
    if (!isPro || sessionStatus !== 'authenticated') return;
    if (isPlaying) return;

    const flushOnPause = async () => {
      const start = listenWallClockRef.current;
      if (start == null) return;
      const sec = Math.min(60, Math.floor((Date.now() - start) / 1000));
      listenWallClockRef.current = null;
      if (sec <= 0) return;
      try {
        const res = await fetch('/api/listen-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: sec }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { proLevel?: number };
        if (typeof data.proLevel === 'number') {
          setProLevelOverride(data.proLevel);
        }
      } catch {
        /* ignore */
      }
    };
    void flushOnPause();
  }, [isPro, sessionStatus, isPlaying]);

  useEffect(() => {
    if (!isPro || sessionStatus !== 'authenticated') return;

    const flush = async () => {
      if (!isPlayingRef.current) return;
      const now = Date.now();
      const start = listenWallClockRef.current ?? now;
      const sec = Math.min(60, Math.floor((now - start) / 1000));
      listenWallClockRef.current = now;
      if (sec <= 0) return;
      try {
        const res = await fetch('/api/listen-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: sec }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { proLevel?: number };
        if (typeof data.proLevel === 'number') {
          setProLevelOverride(data.proLevel);
        }
      } catch {
        /* ignore */
      }
    };

    const id = window.setInterval(() => {
      void flush();
    }, 30_000);
    return () => clearInterval(id);
  }, [isPro, sessionStatus]);

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
      if (isPro && session?.user) {
        void fetch('/api/listen-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: 0, increment_play: true }),
        })
          .then(async (res) => {
            if (!res.ok) return;
            const data = (await res.json()) as { proLevel?: number };
            if (typeof data.proLevel === 'number') {
              setProLevelOverride(data.proLevel);
            }
          })
          .catch(() => {});
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
  const handleSelectPlaylist = useCallback(
    async (playlist: SavedPlaylist) => {
      if (loadingPlaylistId) return;
      if (activePlaylistId === playlist.id) return;

      /** Snapshot at click time — must use `isPlaying` state (not only ref) and keep callback deps in sync. */
      const preservePlaybackAtClick =
        isPlaying && playbackIndex >= 0 && playbackTracks.length > 0;

      if (!preservePlaybackAtClick) {
        setIsPlaying(false);
        setPlaybackIndex(-1);
      }

      const folderId = playlist.folder_id;
      const sub = playlist.tracks_subfolder;
      if (!playlistContentCache.current.has(playlistContentCacheKey(folderId, sub))) {
        setLoadingPlaylistId(playlist.id);
      }

      const result = await loadPlaylistFromDrive(folderId, sub);
      setLoadingPlaylistId(null);

      if (!result || result.tracks.length === 0) return;

      setTracks(result.tracks);
      setActivePlaylistId(playlist.id);
      setCurrentDriveFolderId(playlist.folder_id);
      const title =
        playlist.name?.trim() ||
        result.folderName?.trim() ||
        'Untitled playlist';
      setSelectedFolderName(title.slice(0, PLAYLIST_NAME_MAX_LENGTH));

      if (preservePlaybackAtClick) {
        preloadTrackDurations(result.tracks);
        preloadAudioFiles(result.tracks);
        void updatePlaylistAudioTrackCount(playlist.id, result.tracks.length);
      } else {
        setPlaybackTracks(result.tracks);
        setPlaybackPlaylistId(playlist.id);
        setPlaybackIndex(-1);
        if (isFree) {
          setIsShuffled(true);
          setPlaybackShuffleState(createInitialShuffleState(result.tracks, -1));
        } else {
          setPlaybackShuffleState(resetShuffleState());
        }
        setIsPlaying(false);
        preloadTrackDurations(result.tracks);
        preloadAudioFiles(result.tracks);
        void updatePlaylistAudioTrackCount(playlist.id, result.tracks.length);
      }

      void loadPlaylistFromDrive(folderId, sub, { skipCache: true }).then((fresh) => {
        if (!fresh || activePlaylistIdRef.current !== playlist.id) return;
        if (tracksListsEqualByDriveIds(result.tracks, fresh.tracks)) return;

        const mapIndex = (prev: number): number => {
          if (prev < 0) return prev;
          const oldId = result.tracks[prev]?.id;
          const newIdx = oldId != null ? fresh.tracks.findIndex((t) => t.id === oldId) : -1;
          return newIdx >= 0 ? newIdx : fresh.tracks.length > 0 ? 0 : -1;
        };

        setTracks(fresh.tracks);

        if (playbackPlaylistIdRef.current === playlist.id) {
          setPlaybackTracks(fresh.tracks);
          setPlaybackIndex((prev) => {
            const nextIdx = mapIndex(prev);
            if (isFree) {
              setPlaybackShuffleState(createInitialShuffleState(fresh.tracks, nextIdx));
            } else {
              setPlaybackShuffleState(resetShuffleState());
            }
            return nextIdx;
          });
        }

        preloadTrackDurations(fresh.tracks);
        void updatePlaylistAudioTrackCount(playlist.id, fresh.tracks.length);
      });
    },
    [
      loadingPlaylistId,
      activePlaylistId,
      isFree,
      isPlaying,
      playbackIndex,
      playbackTracks.length,
      preloadTrackDurations,
      preloadAudioFiles,
      loadPlaylistFromDrive,
      updatePlaylistAudioTrackCount,
    ]
  );

  const handleDeletePlaylist = useCallback(async (playlistId: string) => {
    const res = await fetch(`/api/playlists?id=${encodeURIComponent(playlistId)}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Failed to delete playlist');
    }
    setSavedPlaylists((prev) => {
      const victim = prev.find((p) => p.id === playlistId);
      if (victim?.folder_id) {
        playlistContentCache.current.delete(
          playlistContentCacheKey(victim.folder_id, victim.tracks_subfolder)
        );
      }
      return prev.filter((p) => p.id !== playlistId);
    });
    if (playbackPlaylistId === playlistId) {
      setPlaybackTracks([]);
      setPlaybackIndex(-1);
      setPlaybackPlaylistId(null);
      setPlaybackShuffleState(resetShuffleState());
      setIsPlaying(false);
    }
    if (activePlaylistId === playlistId) {
      setTracks([]);
      setActivePlaylistId(null);
      setCurrentDriveFolderId(null);
      setSelectedFolderName(null);
      localStorage.removeItem('droplist_last_playlist_id');
    }
  }, [activePlaylistId, playbackPlaylistId]);

  const handleCoverUploaded = useCallback((playlist: SavedPlaylist) => {
    setSavedPlaylists((prev) =>
      prev.map((p) => (p.id === playlist.id ? playlist : p))
    );
    bumpCoverCache();
  }, [bumpCoverCache]);

  const handleCoverRemoved = useCallback(async () => {
    if (sessionStatus !== 'authenticated' || !activePlaylistId) return;
    try {
      const res = await fetch('/api/playlists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activePlaylistId, cover_url: null }),
      });
      const data = (await res.json()) as { playlist?: SavedPlaylist; error?: string };
      if (!res.ok || !data.playlist) return;
      setSavedPlaylists((prev) =>
        prev.map((p) => (p.id === activePlaylistId ? data.playlist! : p))
      );
      bumpCoverCache();
    } catch {
      /* ignore */
    }
  }, [sessionStatus, activePlaylistId, bumpCoverCache]);

  const handleAlbumTitleChange = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setSelectedFolderName(trimmed);
      if (sessionStatus !== 'authenticated' || !activePlaylistId) return;
      try {
        const res = await fetch('/api/playlists', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activePlaylistId, name: trimmed }),
        });
        const data = (await res.json()) as { playlist?: SavedPlaylist; error?: string };
        if (!res.ok) return;
        if (data.playlist) {
          setSavedPlaylists((prev) =>
            prev.map((p) => (p.id === activePlaylistId ? { ...p, name: trimmed } : p))
          );
        }
      } catch {
        /* ignore */
      }
    },
    [sessionStatus, activePlaylistId]
  );

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
    } else if (savedPlaylists[0]) {
      // e.g. Free plan only returns oldest playlist; lastId may point at a hidden row
      handleSelectPlaylist(savedPlaylists[0]);
    }
  }, [sessionStatus, savedPlaylists, handleSelectPlaylist]);

  // After plan/playlist fetch, active id may no longer be in the visible list (downgrade to Free)
  useEffect(() => {
    if (savedPlaylists.length === 0 || !activePlaylistId) return;
    if (savedPlaylists.some(p => p.id === activePlaylistId)) return;
    handleSelectPlaylist(savedPlaylists[0]);
  }, [savedPlaylists, activePlaylistId, handleSelectPlaylist]);

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
    setPlaybackTracks(next);
    setPlaybackIndex(-1);
    setPlaybackPlaylistId(null);
    setIsPlaying(false);
    setCurrentDriveFolderId(null); // Local playlist: no Drive folder for stats

    // Free users: always force shuffle on
    if (isFree) {
      setIsShuffled(true);
      setPlaybackShuffleState(createInitialShuffleState(next, -1));
    } else {
      setPlaybackShuffleState(resetShuffleState());
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

  const handleNext = useCallback(() => {
    if (playbackTracks.length === 0) return;

    if (!assertFreePlayQuota()) {
      setIsPlaying(false);
      return;
    }

    maybeCancelExpiredSleepTimerOnManualTrackChange();
    setPlaybackProgress(0);
    
    // Free users always shuffle; Pro users respect the toggle
    const shouldShuffle = isFree || isShuffled;
    if (shouldShuffle) {
      const result = getNextShuffleTrack(playbackTracks, playbackIndex, playbackShuffleState);
      if (result) {
        setPlaybackIndex(result.nextIndex);
        setPlaybackShuffleState(result.newState);
      }
    } else {
      const nextIndex = (playbackIndex + 1) % playbackTracks.length;
      setPlaybackIndex(nextIndex);
    }
    setIsPlaying(true);
  }, [
    playbackTracks,
    isShuffled,
    isFree,
    playbackIndex,
    playbackShuffleState,
    maybeCancelExpiredSleepTimerOnManualTrackChange,
    assertFreePlayQuota,
  ]);

  const handlePrev = useCallback(() => {
    if (playbackTracks.length === 0) return;

    if (!assertFreePlayQuota()) {
      setIsPlaying(false);
      return;
    }

    maybeCancelExpiredSleepTimerOnManualTrackChange();
    setPlaybackProgress(0);
    const shouldShuffle = isFree || isShuffled;
    if (shouldShuffle) {
      const result = getPrevShuffleTrack(playbackTracks, playbackIndex, playbackShuffleState);
      if (result) {
        setPlaybackIndex(result.prevIndex);
        setPlaybackShuffleState(result.newState);
      }
    } else {
      const prevIndex = (playbackIndex - 1 + playbackTracks.length) % playbackTracks.length;
      setPlaybackIndex(prevIndex);
    }
    setIsPlaying(true);
  }, [
    playbackTracks,
    isShuffled,
    isFree,
    playbackIndex,
    playbackShuffleState,
    maybeCancelExpiredSleepTimerOnManualTrackChange,
    assertFreePlayQuota,
  ]);

  const handleTrackEnded = useCallback(() => {
    // Time is up: let current song finish, then stop and do not advance.
    if (sleepTimerExpired) {
      setIsPlaying(false);
      setPlaybackProgress(0);
      setPlaybackIndex(-1);
      clearSleepTimer();
      return;
    }
    handleNext();
  }, [sleepTimerExpired, clearSleepTimer, handleNext]);

  const handleShuffleToggle = useCallback(() => {
    if (isFree) { showUpgradeFor('feature'); return; }
    setIsShuffled((s) => {
      const toggled = !s;
      
      if (toggled) {
        setIsRepeated(false);
        setPlaybackShuffleState(createInitialShuffleState(playbackTracks, playbackIndex));
      } else {
        setPlaybackShuffleState(resetShuffleState());
      }
      return toggled;
    });
  }, [playbackTracks, playbackIndex, isFree, showUpgradeFor]);

  const handleRepeatToggle = useCallback(() => {
    if (isFree) { showUpgradeFor('feature'); return; }
    setIsRepeated((r) => {
      const newRepeatState = !r;
      if (newRepeatState) {
        setIsShuffled(false);
        setPlaybackShuffleState(resetShuffleState());
      }
      return newRepeatState;
    });
  }, [isFree, showUpgradeFor]);

  const handleDurationLoaded = useCallback(
    (track: TrackType, duration: number) => {
      const cacheKey = getTrackCacheKey(track);
      setTrackDurations((prev) => new Map(prev.set(cacheKey, duration)));
    },
    [getTrackCacheKey]
  );

  const albumDurationReady = useMemo(() => {
    if (tracks.length === 0) return true;
    return tracks.every((t) => trackDurations.has(getTrackCacheKey(t)));
  }, [tracks, trackDurations, getTrackCacheKey]);

  const totalDuration = useMemo(
    () =>
      tracks.reduce((total, track) => {
        const cacheKey = getTrackCacheKey(track);
        const duration = trackDurations.get(cacheKey) || 0;
        return total + duration;
      }, 0),
    [tracks, trackDurations, getTrackCacheKey]
  );

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
          if (playbackTracks.length > 0) {
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
  }, [playbackTracks.length, isPlaying, isFree, handlePrev, handleNext, currentTrack, isStageViewOpen, closeStageView, openStageView]);

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
            playlistAddAllowed={playlistAddAllowed}
            savedPlaylists={savedPlaylists}
            activePlaylistId={activePlaylistId}
            tracks={tracks}
            coverCacheRev={coverCacheRev}
            playbackPlaylistId={playbackPlaylistId}
            isAudioPlaying={isPlaying}
            loadingPlaylistId={loadingPlaylistId}
            loadingPlaylists={isAuthPending || isPlaylistCatalogLoading}
            onGoogleDrivePicked={async (picked, folderName, coverUrl, driveFolderId, tracksSubfolder = '') => {
              if (driveFolderId) {
                playlistContentCache.current.set(playlistContentCacheKey(driveFolderId, tracksSubfolder), {
                  tracks: picked,
                  folderName: folderName?.trim() || undefined,
                  fetchedAt: Date.now(),
                });
              }
              setTracks(picked);
              setPlaybackTracks(picked);
              setPlaybackIndex(-1);
              setPlaybackPlaylistId(null);
              setIsPlaying(false);
              setCurrentDriveFolderId(driveFolderId ?? null);

              if (isFree) {
                setIsShuffled(true);
                setPlaybackShuffleState(createInitialShuffleState(picked, -1));
              } else {
                setPlaybackShuffleState(resetShuffleState());
              }

              if (folderName) {
                setSelectedFolderName(
                  folderName.trim().slice(0, PLAYLIST_NAME_MAX_LENGTH) || 'Untitled Playlist'
                );
              }

              preloadTrackDurations(picked);
              preloadAudioFiles(picked);

              // Persist playlist to Supabase
              if (driveFolderId && session?.user) {
                try {
                  const nameForApi =
                    (folderName || 'Untitled Playlist')
                      .trim()
                      .slice(0, PLAYLIST_NAME_MAX_LENGTH) || 'Untitled Playlist';
                  const res = await fetch('/api/playlists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      folder_url: `https://drive.google.com/drive/folders/${driveFolderId}`,
                      folder_id: driveFolderId,
                      name: nameForApi,
                      cover_url: null,
                      tracks_subfolder: tracksSubfolder,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    if (res.status === 403 && typeof data.error === 'string') {
                      setPlaylistCapModalMessage(data.error);
                      setPlaylistCapModalOpen(true);
                    }
                    return;
                  }
                  if (data.playlist && !data.alreadyExists) {
                    setSavedPlaylists((prev) => [...prev, data.playlist]);
                    setActivePlaylistId(data.playlist.id);
                    setPlaybackPlaylistId(data.playlist.id);
                    void updatePlaylistAudioTrackCount(data.playlist.id, picked.length);
                  } else if (data.alreadyExists && data.playlist) {
                    setActivePlaylistId(data.playlist.id);
                    setPlaybackPlaylistId(data.playlist.id);
                    void updatePlaylistAudioTrackCount(data.playlist.id, picked.length);
                  }
                } catch { /* ignore save errors */ }
              }
            }}
            onSelectPlaylist={handleSelectPlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onAddBlocked={() => {
              if (session?.user?.plan === UserPlan.Pro) {
                setPlaylistCapModalMessage(
                  'You have reached the maximum number of saved playlists for your listening rank on Pro: 5 through Gold, 6 from Sapphire, 8 at Emerald. Delete a playlist to add another, or earn a higher rank under Settings → Listening Ranks.',
                );
                setPlaylistCapModalOpen(true);
              } else {
                showUpgradeFor('feature');
              }
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => {
              setSidebarCollapsed(prev => {
                const next = !prev;
                if (!next) closeStageView('sidebar-expanded-manually');
                return next;
              });
            }}
          />

          {sessionStatus === 'authenticated' && sessionForUi && settingsOpen ? (
            <Suspense fallback={null}>
              <SettingsPanel
                open={settingsOpen}
                onClose={closeSettings}
                session={sessionForUi}
                profileMeta={profileMeta}
                profileMetaLoading={profileMetaLoading}
                subData={subData}
                subLoading={subLoading}
                onNameSaved={handleNameSaved}
                onRefreshProfile={refreshProfile}
              />
            </Suspense>
          ) : null}

          {/* Main Content */}
          <div className="main-wrapper">
            {/* Auth – positioned absolute to main-wrapper top-right */}
            <div className="header-auth">
              {sessionStatus === 'loading' ? null : sessionForUi ? (
                <div
                  ref={authDropdownRef}
                  className={`header-auth-logged-in${authDropdownOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="header-auth-avatar-wrap"
                    aria-expanded={authDropdownOpen}
                    aria-haspopup="menu"
                    aria-label={
                      sessionForUi.user?.proLevel != null && isProLevelRank(sessionForUi.user.proLevel)
                        ? `Account menu, ${PRO_LEVEL_DISPLAY[sessionForUi.user.proLevel as ProLevelRank].name} rank`
                        : 'Account menu'
                    }
                    onClick={toggleAuthDropdown}
                  >
                    <span className="header-auth-avatar-main">
                      {sessionForUi.user?.proLevel != null && isProLevelRank(sessionForUi.user.proLevel) ? (
                        <span
                          className={`header-auth-avatar-ring ranks-catalog-card--${PRO_LEVEL_DISPLAY[sessionForUi.user.proLevel as ProLevelRank].name.toLowerCase()}`}
                        >
                          {sessionForUi.user?.image ? (
                            <img
                              src={sessionForUi.user.image}
                              alt=""
                              className="header-auth-avatar"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const placeholder = document.createElement('div');
                                placeholder.className = 'header-auth-avatar-placeholder';
                                placeholder.textContent = (sessionForUi.user?.name || sessionForUi.user?.email || '?').charAt(0).toUpperCase();
                                target.parentNode?.replaceChild(placeholder, target);
                              }}
                            />
                          ) : (
                            <div className="header-auth-avatar-placeholder">
                              {(sessionForUi.user?.name || sessionForUi.user?.email || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </span>
                      ) : sessionForUi.user?.image ? (
                        <img
                          src={sessionForUi.user.image}
                          alt=""
                          className="header-auth-avatar"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const placeholder = document.createElement('div');
                            placeholder.className = 'header-auth-avatar-placeholder';
                            placeholder.textContent = (sessionForUi.user?.name || sessionForUi.user?.email || '?').charAt(0).toUpperCase();
                            target.parentNode?.replaceChild(placeholder, target);
                          }}
                        />
                      ) : (
                        <div className="header-auth-avatar-placeholder">
                          {(sessionForUi.user?.name || sessionForUi.user?.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </span>
                  </button>
                  <div className="header-auth-dropdown" role="menu">
                    <div className="header-auth-dropdown-glow" aria-hidden />
                    <div className="header-auth-dropdown-header">
                      <div className="header-auth-dropdown-user">
                        <span className="header-auth-dropdown-name">
                          {sessionForUi.user?.name || sessionForUi.user?.email || 'Account'}
                        </span>
                        {isPro ? (
                          <ProBadge size="xs" />
                        ) : (
                          <FreeBadge size="xs" />
                        )}
                        {sessionForUi.user?.proLevel != null && isProLevelRank(sessionForUi.user.proLevel) ? (
                          <span
                            className={`ranks-your-card-badge ranks-catalog-card--${PRO_LEVEL_DISPLAY[sessionForUi.user.proLevel as ProLevelRank].name.toLowerCase()}`}
                          >
                            {proLevelLabel(sessionForUi.user.proLevel)}
                          </span>
                        ) : (
                          <span className="header-auth-dropdown-rank header-auth-dropdown-rank--empty">—</span>
                        )}
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
                      <button
                        type="button"
                        className="header-auth-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          closeAuthDropdown();
                          startTransition(() => setSettingsOpen(true));
                        }}
                      >
                        <span className="header-auth-dropdown-item-icon" aria-hidden>
                          <Settings size={15} strokeWidth={1.75} />
                        </span>
                        <span className="header-auth-dropdown-item-label">Settings</span>
                      </button>
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
                  {isFree && session && tracks.length > 0 && (
                    <div className="image-toggle-control">
                      <div className={`remaining-plays ${remainingPlays <= 3 ? 'remaining-plays-warn' : ''}`}>
                        <Shuffle size={15} strokeWidth={2.25} aria-hidden />
                        <span className="remaining-plays-count">{remainingPlays}</span>
                        <span className="remaining-plays-label">plays left today</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <PlaylistHeader
                tracks={tracks}
                selectedFolderName={selectedFolderName}
                totalDuration={totalDuration}
                albumDurationReady={albumDurationReady}
                isPlaying={isPlaying}
                playbackIsFromThisPlaylist={playbackPlaylistId === activePlaylistId}
                currentIndex={headerPlaybackIndex}
                albumCoverUrl={linkedAlbumCoverUrl}
                showCoverImage={!!rawAlbumCoverUrl}
                onAlbumTitleChange={handleAlbumTitleChange}
                canEditAlbumCover={isPro}
                onAlbumCoverRequiresPro={() => showUpgradeFor('feature')}
                coverPlaylistId={activePlaylistId}
                coverUploadEnabled={
                  sessionStatus === 'authenticated' && Boolean(activePlaylistId)
                }
                onCoverUploaded={handleCoverUploaded}
                onCoverRemoved={handleCoverRemoved}
                onPlayPause={() => {
                  if (tracks.length > 0) {
                    setIsPlaying(!isPlaying);
                  }
                }}
                onPlayFirst={async () => {
                  if (tracks.length > 0) {
                    if (!assertFreePlayQuota()) return;
                    maybeCancelExpiredSleepTimerOnManualTrackChange();
                    setPlaybackTracks(tracks);
                    setPlaybackPlaylistId(activePlaylistId);
                    if (isFree) {
                      const randomIndex = Math.floor(Math.random() * tracks.length);
                      setPlaybackIndex(randomIndex);
                      setPlaybackShuffleState(createInitialShuffleState(tracks, randomIndex));
                    } else {
                      setPlaybackIndex(0);
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
                  const playingId =
                    playbackIndex >= 0 && playbackIndex < playbackTracks.length
                      ? playbackTracks[playbackIndex]?.id
                      : null;
                  const isPlaybackRow = playingId != null && track.id === playingId;
                  return (
                    <TrackItem
                      key={track.id}
                      index={i}
                      trackId={track.id}
                      title={trackInfo.title}
                      artist={trackInfo.artist}
                      isActive={isPlaybackRow}
                      isPlaying={isPlaybackRow && isPlaying}
                      isFree={isFree}
                      duration={trackDurations.get(cacheKey) || 0}
                      durationLoaded={trackDurations.has(cacheKey)}
                      durationLoading={loadingDurations.has(cacheKey)}
                      onClick={handleTrackClick}
                    />
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
                  onPlayPauseToggle={togglePlayPause}
                  onIsPlayingChange={handleIsPlayingChange}
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
                  onToggleStageView={noopToggleStageView}
                  seekDisabled={isFree}
                  onSeekBlocked={handleSeekBlocked}
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

      <AlertModal
        open={playlistCapModalOpen}
        onClose={() => setPlaylistCapModalOpen(false)}
        title="Playlist limit"
        message={playlistCapModalMessage}
      />

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeModalReason}
        remainingPlays={remainingPlays}
        allowDismissUntilTomorrow={upgradeModalReason === 'entry'}
      />
    </main>
  );
}