// src/components/AudioPlayer.tsx
'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from 'react';
import { TrackType } from '../lib/types';
import { CaretRightOutlined, PauseOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';
import { Play, Pause, Music } from 'lucide-react';
import { formatDuration } from '../../utils/time';
import { parseTrackName } from '../../utils/track';
import ScrollingText from './ScrollingText';
import { useAudioRetryRecovery } from '../hooks/useAudioRetryRecovery';
import { resolveDriveStreamUrl } from '../lib/driveStreamUrlClient';

type Props = {
    track?: TrackType;
    volume: number;
    onEnded: () => void;
    onVolumeChange: (v: number) => void;
    onPlayPauseToggle: () => void;
    onIsPlayingChange?: (v: boolean) => void;
    isPlaying: boolean;
    isShuffled: boolean;
    isRepeated: boolean;
    handlePrev: () => void;
    handleNext: () => void;
    handleShuffleToggle: () => void;
    handleRepeatToggle: () => void;
    /** Uses the same track identity as the parent’s duration map (`getTrackCacheKey`). */
    onDurationLoaded?: (track: TrackType, duration: number) => void;
    getCachedBlobUrl?: (track: TrackType) => string | undefined;
    isStageViewOpen?: boolean;
    onToggleStageView?: () => void;
    /** Called once when playback actually starts (for play-count stats) */
    onTrackPlayed?: (track: TrackType) => void;
    /** Unrecoverable load/play failure (after retries or immediate play() rejection) */
    onPlaybackFailed?: () => void;
    /** Called on time update with progress 0–1 */
    onProgressUpdate?: (progress: number) => void;
    /** True when sleep timer is in "finish this track then stop" mode */
    isSleepTimerExpired?: boolean;
    /** Free tier: same bar as Pro; clicks do not seek and call onSeekBlocked (upgrade) instead */
    seekDisabled?: boolean;
    onSeekBlocked?: () => void;
};

const AUDIO_PLAYBACK_DEBUG = true;

function AudioPlayer({
    track,
    volume,
    onEnded,
    onVolumeChange,
    onPlayPauseToggle,
    onIsPlayingChange,
    isPlaying,
    isShuffled,
    isRepeated,
    handlePrev,
    handleNext,
    handleShuffleToggle,
    handleRepeatToggle,
    onDurationLoaded,
    getCachedBlobUrl,
    isStageViewOpen,
    onToggleStageView,
    onTrackPlayed,
    onPlaybackFailed,
    onProgressUpdate,
    isSleepTimerExpired,
    seekDisabled = false,
    onSeekBlocked,
}: Props) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    /** Mirrors `isPlaying` for async play() callbacks (must not rely on stale closure). */
    const isPlayingRef = useRef(isPlaying);
    const trackTitleRef = useRef<HTMLDivElement>(null);
    const manualPauseTogglePendingRef = useRef(false);
    const unexpectedPauseResumeInFlightRef = useRef(false);
    const pendingUnexpectedPauseResumeOnVisibleRef = useRef(false);
    /** Set `true` during intentional track-switch pause so handlePause doesn't flip isPlaying. */
    const trackSwitchPauseRef = useRef(false);
    const [duration, setDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [trackDurations, setTrackDurations] = useState<Map<string, number>>(new Map());
    const [shouldScroll, setShouldScroll] = useState<boolean>(false);

    /**
     * Resolved URL is stored with the track id it belongs to. While switching tracks, `src` is omitted
     * until this matches the current `track.id`, so the old file cannot keep playing during async resolve.
     * (Never use `src=""` — React warns and the browser may request the HTML document.)
     */
    const [resolvedMedia, setResolvedMedia] = useState<{ tid: string; url: string } | null>(null);

    useLayoutEffect(() => {
        if (!track) {
            setResolvedMedia(null);
            return;
        }
        if (track.file) {
            const u = getCachedBlobUrl?.(track);
            setResolvedMedia(u ? { tid: track.id, url: u } : null);
            return;
        }
        const remote = track.googleDriveUrl || track.url;
        if (!remote) {
            setResolvedMedia(null);
            return;
        }
        if (/^https?:\/\//i.test(remote)) {
            setResolvedMedia({ tid: track.id, url: remote });
            return;
        }
        if (remote.includes('/api/drive-file') && track.id) {
            setResolvedMedia(null);
            return;
        }
        setResolvedMedia({ tid: track.id, url: remote });
    }, [track?.id, track?.googleDriveUrl, track?.url, track?.file, getCachedBlobUrl]);

    useEffect(() => {
        if (!track?.id) return;
        const remote = track.googleDriveUrl || track.url;
        if (!remote?.includes('/api/drive-file')) return;
        let cancelled = false;
        const tid = track.id;
        console.log('[AudioDebug] resolving stream URL', { trackId: tid });
        void resolveDriveStreamUrl(tid).then((url) => {
            if (!cancelled) {
                console.log('[AudioDebug] stream URL resolved', { trackId: tid, url: url.substring(0, 80), isPlayingRef: isPlayingRef.current });
                setResolvedMedia({ tid, url });
            } else {
                console.log('[AudioDebug] stream URL resolved but cancelled', { trackId: tid });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [track?.id, track?.googleDriveUrl, track?.url]);

    useLayoutEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        trackSwitchPauseRef.current = true;
        audio.pause();
        audio.currentTime = 0;
        if (!track?.id) {
            audio.src = '';
            audio.load();
        }
        console.log('[AudioDebug] track-switch layout pause', { trackId: track?.id, paused: audio.paused });
        queueMicrotask(() => {
            trackSwitchPauseRef.current = false;
        });
    }, [track?.id]);

    const src =
        track?.id && resolvedMedia?.tid === track.id && resolvedMedia.url
            ? resolvedMedia.url
            : undefined;

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volume;
    }, [volume]);

    // Track event listeners for cleanup
    const eventListenersRef = useRef<(() => void)[]>([]);
    
    // Track document event listeners with unique IDs
    const documentEventListenersRef = useRef<Map<string, () => void>>(new Map());
    
    // Cleanup all event listeners
    const cleanupEventListeners = useCallback(() => {
        eventListenersRef.current.forEach(cleanup => cleanup());
        eventListenersRef.current = [];
    }, []);
    
    // Cleanup all document event listeners
    const cleanupDocumentEventListeners = useCallback(() => {
        documentEventListenersRef.current.forEach(cleanup => cleanup());
        documentEventListenersRef.current.clear();
    }, []);
    const {
        clearAudioRetryTimeout,
        resetAudioRetryState,
        handleAudioRecovered,
        handleAudioError,
        shouldSuppressPauseSync,
    } = useAudioRetryRecovery({
        trackId: track?.id,
        isPlaying,
        handleNext,
        onPlaybackFailed,
        debug: false,
    });
    const logAudioPlaybackDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
        if (!AUDIO_PLAYBACK_DEBUG) return;
        const audio = audioRef.current;
        console.log(`[AudioDebug] ${event}`, {
            trackId: track?.id,
            src: audio?.currentSrc || audio?.src || src,
            isPlayingProp: isPlaying,
            audioPaused: audio?.paused,
            audioEnded: audio?.ended,
            readyState: audio?.readyState,
            networkState: audio?.networkState,
            currentTime: audio?.currentTime,
            ...payload,
        });
    }, [track?.id, src, isPlaying]);

    const handleUserPlayPauseClick = useCallback(() => {
        manualPauseTogglePendingRef.current = true;
        logAudioPlaybackDebug('user play/pause button clicked');
        onPlayPauseToggle();
    }, [onPlayPauseToggle, logAudioPlaybackDebug]);

    // Audio cleanup on unmount and fast refresh
    useEffect(() => {
        return () => {
            const audio = audioRef.current;
            if (audio) {
                // Stop all audio operations
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
                audio.load();
                
                // Clear all event listeners
                audio.removeEventListener('canplay', () => {});
                audio.removeEventListener('play', () => {});
                audio.removeEventListener('pause', () => {});
                audio.removeEventListener('ended', () => {});
                audio.removeEventListener('loadedmetadata', () => {});
                audio.removeEventListener('timeupdate', () => {});
                audio.removeEventListener('error', () => {});
            }
            clearAudioRetryTimeout();
            cleanupEventListeners();
            cleanupDocumentEventListeners();
        };
    }, [cleanupEventListeners, cleanupDocumentEventListeners, clearAudioRetryTimeout]);

    // Handle fast refresh by stopping audio immediately when component unmounts
    useEffect(() => {
        return () => {
            // Immediate cleanup for fast refresh
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
                audio.load();
            }
            clearAudioRetryTimeout();
        };
    }, [clearAudioRetryTimeout]); // Empty dependency array means this runs on every unmount

    // Fast refresh test #2 - triggering another refresh

    // Audio state validation and play/pause handling
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!src) {
            logAudioPlaybackDebug('playback effect: no src yet, skipping (isPlaying kept)', { isPlaying });
            return;
        }

        cleanupEventListeners();
        logAudioPlaybackDebug('playback effect start', { src, isPlaying });

        const isNotAllowedError = (error: unknown) =>
            error instanceof DOMException
                ? error.name === 'NotAllowedError'
                : error instanceof Error && error.name === 'NotAllowedError';

        const tryPlay = () => {
            if (!isPlayingRef.current) {
                logAudioPlaybackDebug('tryPlay: isPlayingRef is false, aborting');
                return;
            }
            logAudioPlaybackDebug('tryPlay: calling audio.play()', {
                readyState: audio.readyState,
                paused: audio.paused,
                currentSrc: audio.currentSrc,
            });
            void audio.play().catch((error: unknown) => {
                if (isNotAllowedError(error)) {
                    logAudioPlaybackDebug('play() NotAllowedError; retry when buffer advances');
                    const retry = () => {
                        audio.removeEventListener('canplay', retry);
                        audio.removeEventListener('loadeddata', retry);
                        if (!isPlayingRef.current) return;
                        logAudioPlaybackDebug('retrying play() after NotAllowedError');
                        void audio.play().catch(() => {
                            /* user can tap play again */
                        });
                    };
                    audio.addEventListener('canplay', retry);
                    audio.addEventListener('loadeddata', retry);
                    eventListenersRef.current.push(() => {
                        audio.removeEventListener('canplay', retry);
                        audio.removeEventListener('loadeddata', retry);
                    });
                    return;
                }
                console.error('Audio play failed:', error);
                logAudioPlaybackDebug('play() failed', { error });
                onPlayPauseToggle();
            });
        };

        if (isPlaying) {
            logAudioPlaybackDebug('requested play');
            if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                logAudioPlaybackDebug('play immediately (readyState >= 2)');
                tryPlay();
            } else {
                logAudioPlaybackDebug('play deferred; waiting for media');
                const onReady = () => {
                    audio.removeEventListener('canplay', onReady);
                    audio.removeEventListener('loadeddata', onReady);
                    audio.removeEventListener('canplaythrough', onReady);
                    logAudioPlaybackDebug('media ready; attempting play');
                    tryPlay();
                };
                audio.addEventListener('canplay', onReady);
                audio.addEventListener('loadeddata', onReady);
                audio.addEventListener('canplaythrough', onReady);
                eventListenersRef.current.push(() => {
                    audio.removeEventListener('canplay', onReady);
                    audio.removeEventListener('loadeddata', onReady);
                    audio.removeEventListener('canplaythrough', onReady);
                });
                queueMicrotask(() => {
                    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && isPlayingRef.current) {
                        audio.removeEventListener('canplay', onReady);
                        audio.removeEventListener('loadeddata', onReady);
                        audio.removeEventListener('canplaythrough', onReady);
                        logAudioPlaybackDebug('play after microtask (readyState catch-up)');
                        tryPlay();
                    }
                });
                requestAnimationFrame(() => {
                    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && isPlayingRef.current) {
                        audio.removeEventListener('canplay', onReady);
                        audio.removeEventListener('loadeddata', onReady);
                        audio.removeEventListener('canplaythrough', onReady);
                        logAudioPlaybackDebug('play after rAF (readyState catch-up)');
                        tryPlay();
                    }
                });
            }
        } else {
            logAudioPlaybackDebug('requested pause');
            audio.pause();
        }
    }, [isPlaying, src, cleanupEventListeners, logAudioPlaybackDebug, onPlayPauseToggle]);

    // Report play once per track start (for stats), and sync UI with play/pause
    const hasReportedPlayRef = useRef(false);
    useEffect(() => {
        hasReportedPlayRef.current = false;
        manualPauseTogglePendingRef.current = false;
        unexpectedPauseResumeInFlightRef.current = false;
        pendingUnexpectedPauseResumeOnVisibleRef.current = false;
        resetAudioRetryState(track?.id ?? src ?? null);
    }, [track?.id, src, resetAudioRetryState]);

    // Sync UI with actual audio state via play/pause events
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !onIsPlayingChange) return;

        const handlePlay = () => {
            logAudioPlaybackDebug('native play event');
            pendingUnexpectedPauseResumeOnVisibleRef.current = false;
            onIsPlayingChange(true);
            if (track && onTrackPlayed && !hasReportedPlayRef.current) {
                hasReportedPlayRef.current = true;
                onTrackPlayed(track);
            }
        };
        const handlePause = () => {
            if (trackSwitchPauseRef.current) {
                logAudioPlaybackDebug('native pause event suppressed (track-switch pause)');
                return;
            }

            if (shouldSuppressPauseSync(audio)) {
                logAudioPlaybackDebug('native pause event suppressed during recovery');
                return;
            }

            if (manualPauseTogglePendingRef.current) {
                manualPauseTogglePendingRef.current = false;
                logAudioPlaybackDebug('native pause event accepted (manual toggle)');
                onIsPlayingChange(false);
                return;
            }

            const shouldConsiderUnexpectedPauseResume =
                isPlaying &&
                !audio.ended &&
                audio.readyState >= 2;

            if (shouldConsiderUnexpectedPauseResume && document.visibilityState !== 'visible') {
                pendingUnexpectedPauseResumeOnVisibleRef.current = true;
                logAudioPlaybackDebug('unexpected pause while hidden; queued auto-resume for visible');
                return;
            }

            if (shouldConsiderUnexpectedPauseResume && !unexpectedPauseResumeInFlightRef.current) {
                unexpectedPauseResumeInFlightRef.current = true;
                logAudioPlaybackDebug('unexpected native pause detected; attempting auto-resume');
                audio.play().then(() => {
                    unexpectedPauseResumeInFlightRef.current = false;
                    pendingUnexpectedPauseResumeOnVisibleRef.current = false;
                    logAudioPlaybackDebug('auto-resume after unexpected pause succeeded');
                    // Keep playing intent; native play event will sync state.
                }).catch((error) => {
                    unexpectedPauseResumeInFlightRef.current = false;
                    pendingUnexpectedPauseResumeOnVisibleRef.current = false;
                    logAudioPlaybackDebug('auto-resume after unexpected pause failed', { error });
                    onIsPlayingChange(false);
                });
                return;
            }

            logAudioPlaybackDebug('native pause event');
            onIsPlayingChange(false);
        };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);

        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
        };
    }, [onIsPlayingChange, onTrackPlayed, track, src, logAudioPlaybackDebug, shouldSuppressPauseSync, isPlaying]);

    // Extra media-event diagnostics for "random pause" investigation.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const logEvent = (name: string) => () => {
            logAudioPlaybackDebug(`media event: ${name}`);
        };

        const handlers: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [
            ['playing', logEvent('playing')],
            ['waiting', logEvent('waiting')],
            ['stalled', logEvent('stalled')],
            ['suspend', logEvent('suspend')],
            ['abort', logEvent('abort')],
            ['seeking', logEvent('seeking')],
            ['seeked', logEvent('seeked')],
            ['ended', logEvent('ended')],
            ['canplay', logEvent('canplay')],
            ['canplaythrough', logEvent('canplaythrough')],
            ['loadstart', logEvent('loadstart')],
        ];

        handlers.forEach(([event, handler]) => {
            audio.addEventListener(event, handler);
        });

        return () => {
            handlers.forEach(([event, handler]) => {
                audio.removeEventListener(event, handler);
            });
        };
    }, [src, track?.id, logAudioPlaybackDebug]);

    // On tab becoming visible, reconcile UI state with element state
    useEffect(() => {
        if (!onIsPlayingChange) return;
        const handleVisibility = () => {
            logAudioPlaybackDebug('document visibility changed', { visibilityState: document.visibilityState });
            if (document.visibilityState === 'visible') {
                const audio = audioRef.current;
                if (!audio) return;

                if (
                    pendingUnexpectedPauseResumeOnVisibleRef.current &&
                    isPlaying &&
                    audio.paused &&
                    !audio.ended &&
                    !unexpectedPauseResumeInFlightRef.current
                ) {
                    unexpectedPauseResumeInFlightRef.current = true;
                    logAudioPlaybackDebug('visibility became visible; replaying queued unexpected pause');
                    audio.play().then(() => {
                        unexpectedPauseResumeInFlightRef.current = false;
                        pendingUnexpectedPauseResumeOnVisibleRef.current = false;
                        logAudioPlaybackDebug('queued auto-resume succeeded after visible');
                    }).catch((error) => {
                        unexpectedPauseResumeInFlightRef.current = false;
                        pendingUnexpectedPauseResumeOnVisibleRef.current = false;
                        logAudioPlaybackDebug('queued auto-resume failed after visible', { error });
                        onIsPlayingChange(false);
                    });
                    return;
                }

                const actuallyPlaying = !audio.paused && !audio.ended && audio.readyState >= 2;
                if (isPlaying !== actuallyPlaying) {
                    if (!actuallyPlaying && shouldSuppressPauseSync(audio)) {
                        logAudioPlaybackDebug('visibility reconcile pause suppressed during recovery', {
                            actuallyPlaying,
                        });
                        return;
                    }
                    if (!actuallyPlaying && pendingUnexpectedPauseResumeOnVisibleRef.current) {
                        logAudioPlaybackDebug('visibility reconcile pause suppressed due to queued unexpected-resume');
                        return;
                    }
                    logAudioPlaybackDebug('visibility reconcile state', { actuallyPlaying });
                    onIsPlayingChange(actuallyPlaying);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [onIsPlayingChange, isPlaying, logAudioPlaybackDebug, shouldSuppressPauseSync]);

    // Parse track info early so it can be used in useEffects
    const trackInfo = track ? parseTrackName(track.name) : { title: 'No track selected', artist: 'Local File' };

    // Check for text overflow to enable scrolling
    useEffect(() => {
        const checkTextOverflow = () => {
            const titleElement = trackTitleRef.current;
            if (!titleElement) return;

            // Check if text overflows by comparing to actual container width
            const isOverflowing = titleElement.scrollWidth > titleElement.clientWidth;
            setShouldScroll(isOverflowing);
        };

        // Reset shouldScroll first
        setShouldScroll(false);

        // Check immediately and after delays to ensure DOM is ready
        checkTextOverflow();
        const timeoutId = setTimeout(checkTextOverflow, 100);
        const timeoutId2 = setTimeout(checkTextOverflow, 500);
        const timeoutId3 = setTimeout(checkTextOverflow, 1000); // Extra check

        return () => {
            clearTimeout(timeoutId);
            clearTimeout(timeoutId2);
            clearTimeout(timeoutId3);
        };
    }, [trackInfo.title, track?.id]); // Add track.id to dependencies

    // Reset progress on new source
    useEffect(() => {
        setCurrentTime(0);
        setDuration(0);
    }, [src]);

    const handleLoadedMetadata = () => {
        const audio = audioRef.current;
        if (!audio || !track) return;
        handleAudioRecovered(audio, track.id);
        const trackDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
        setDuration(trackDuration);
        
        // Notify parent component about the duration
        if (onDurationLoaded && trackDuration > 0) {
            onDurationLoaded(track, trackDuration);
        }
    };

    const handleTimeUpdate = () => {
        if (isSeeking) return;
        const audio = audioRef.current;
        if (!audio) return;
        setCurrentTime(audio.currentTime || 0);
        if (onProgressUpdate && audio.duration > 0) {
            onProgressUpdate(audio.currentTime / audio.duration);
        }
    };

    const handleEnded = () => {
        logAudioPlaybackDebug('handleEnded invoked', { isSleepTimerExpired, isRepeated });
        // Sleep mode has expired: always defer to parent end handler
        if (isSleepTimerExpired) {
            onEnded();
            return;
        }

        if (isRepeated) {
            // If repeat is enabled, restart the current track
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = 0;
                
                // Check if audio is ready before restarting
                if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
                    audio.play().catch((error) => {
                        console.error('Failed to restart track in repeat mode:', error);
                        // If restart fails, fall back to normal behavior
                        onEnded();
                    });
                } else {
                    // Wait for audio to be ready before restarting
                    const handleCanPlay = () => {
                        audio.removeEventListener('canplay', handleCanPlay);
                        audio.play().catch((error) => {
                            console.error('Failed to restart track after ready:', error);
                            onEnded();
                        });
                    };
                    audio.addEventListener('canplay', handleCanPlay);
                    
                    // Track this event listener for cleanup
                    eventListenersRef.current.push(() => {
                        audio.removeEventListener('canplay', handleCanPlay);
                    });
                }
            }
        } else {
            // Normal behavior: go to next track
            onEnded();
        }
    };

    const handleSeekStart = () => setIsSeeking(true);
    const handleSeekChange = (value: number | [number, number]) => {
        const v = Array.isArray(value) ? value[0] : value;
        setCurrentTime(v);
    };
    const handleSeekEnd = () => {
        const audio = audioRef.current;
        if (!audio) {
            setIsSeeking(false);
            return;
        }
        audio.currentTime = currentTime;
        setIsSeeking(false);
        if (isPlaying) {
            audio.play().catch(() => {});
        }
    };


    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumePercentage = volume * 100;


    return (
        <div className="player-footer">
            <div className="player-container">
                {/* Track Info */}
                <div className="player-track-info">
                    <div className="player-album-art">
                        <div className="player-album-art-fallback show">
                        <Music size={26} strokeWidth={1.75} />
                        </div>
                    </div>
                    <div className="player-text">
                        <div className="player-track-title">
                            {/* Hidden measurement element - always present */}
                            <div 
                                ref={trackTitleRef}
                                style={{ 
                                    position: 'absolute',
                                    visibility: 'hidden',
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    width: '278px', // Exact width from Chrome dev tools
                                    overflow: 'hidden'
                                }}
                            >
                                {trackInfo.title}
                            </div>
                            
                            {/* Visible element - conditional rendering */}
                            {shouldScroll ? (
                                <ScrollingText 
                                    key={`scroll-${track?.id || trackInfo.title}`} // Force remount when track changes
                                    text={trackInfo.title}
                                    className="text-white text-sm font-medium"
                                    containerWidth="w-[278px]"
                                    animationDuration="14s"
                                    animationDelay="1s"
                                />
                            ) : (
                                <div 
                                    style={{ 
                                        color: '#fff',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {trackInfo.title}
                                </div>
                            )}
                        </div>
                        <div className="player-track-artist">{trackInfo.artist}</div>
                    </div>
                </div>

                {/* Controls Section */}
                <div className="player-controls-section">
                    <div className="player-controls">
                        <button 
                            className="control-btn" 
                            onClick={handlePrev} 
                            disabled={!track}
                        >
                            <StepBackwardOutlined style={{ fontSize: '20px' }} />
                        </button>
                        <button 
                            className="play-pause-btn" 
                            onClick={handleUserPlayPauseClick}
                            disabled={!track}
                        >
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        <button 
                            className="control-btn" 
                            onClick={handleNext} 
                            disabled={!track}
                        >
                            <StepForwardOutlined style={{ fontSize: '20px' }} />
                        </button>
                        <button 
                            className="control-btn" 
                            onClick={handleShuffleToggle} 
                            disabled={!track}
                            style={{ color: isShuffled ? '#fff' : '#9ca3af' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                            </svg>
                        </button>
                        <button 
                            className="control-btn" 
                            onClick={handleRepeatToggle} 
                            disabled={!track}
                            style={{ color: isRepeated ? '#fff' : '#9ca3af' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                            </svg>
                        </button>
                        {/* Stage View: hidden in layout.scss (.stage-view-toggle-btn) until feature returns */}
                        <button
                            className={`control-btn stage-view-toggle-btn ${isStageViewOpen ? 'active' : ''}`}
                            type="button"
                            onClick={onToggleStageView}
                            disabled={!track || !onToggleStageView}
                            aria-pressed={!!isStageViewOpen}
                            aria-label="Toggle Stage View"
                        >
                            V
                        </button>
                    </div>
                    
                    <div className="progress-bar-container">
                        <span className="time-label">{formatDuration(currentTime)}</span>
                        <div 
                            className="progress-bar"
                            onMouseDown={(e) => {
                                if (seekDisabled) {
                                    e.preventDefault();
                                    return;
                                }
                                if (!duration) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const updateProgress = (clientX: number) => {
                                    const clickX = clientX - rect.left;
                                    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                                    const newTime = percentage * duration;
                                    setCurrentTime(newTime);
                                    if (audioRef.current) {
                                        audioRef.current.currentTime = newTime;
                                    }
                                };
                                
                                updateProgress(e.clientX);
                                
                                const handleMouseMove = (e: MouseEvent) => {
                                    updateProgress(e.clientX);
                                };
                                
                                // Generate unique ID for this drag session
                                const listenerId = `progress-${Date.now()}-${Math.random()}`;
                                
                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                    
                                    // Remove from tracking using unique ID
                                    documentEventListenersRef.current.delete(listenerId);
                                };
                                
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                                
                                // Track these event listeners with unique ID
                                documentEventListenersRef.current.set(listenerId, () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                });
                            }}
                            onClick={(e) => {
                                if (seekDisabled) {
                                    e.preventDefault();
                                    onSeekBlocked?.();
                                    return;
                                }
                                if (!duration) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                                const newTime = percentage * duration;
                                setCurrentTime(newTime);
                                if (audioRef.current) {
                                    audioRef.current.currentTime = newTime;
                                }
                            }}
                        >
                            <div 
                                className="progress-bar-fill" 
                                style={{ width: `${progressPercentage}%` }}
                            ></div>
                        </div>
                        <span className="time-label">{formatDuration(duration)}</span>
                    </div>
                </div>

                {/* Volume Control */}
                <div className="volume-control">
                    <button className="volume-btn" title={`Volume: ${Math.round(volumePercentage)}%`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </button>
                    <div 
                        className="volume-slider-wrap"
                    >
                    <div className="volume-tooltip">{Math.round(volumePercentage)}%</div>
                    <div 
                        className="volume-slider"
                        style={{ width: '117px' }}
                        onMouseDown={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const updateVolume = (clientX: number) => {
                                const clickX = clientX - rect.left;
                                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                                onVolumeChange(percentage);
                            };
                            
                            updateVolume(e.clientX);
                            
                            const handleMouseMove = (e: MouseEvent) => {
                                updateVolume(e.clientX);
                            };
                            
                            // Generate unique ID for this drag session
                            const listenerId = `volume-${Date.now()}-${Math.random()}`;
                            
                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                                
                                // Remove from tracking using unique ID
                                documentEventListenersRef.current.delete(listenerId);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                            
                            // Track these event listeners with unique ID
                            documentEventListenersRef.current.set(listenerId, () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            });
                        }}
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                            onVolumeChange(percentage);
                        }}
                    >
                        <div 
                            className="volume-slider-fill" 
                            style={{ width: `${volumePercentage}%` }}
                        ></div>
                    </div>
                    </div>
                </div>
            </div>

            <audio
                ref={audioRef}
                {...(src ? { src } : {})}
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onError={handleAudioError}
            />
        </div>
    );
}

export default memo(AudioPlayer);