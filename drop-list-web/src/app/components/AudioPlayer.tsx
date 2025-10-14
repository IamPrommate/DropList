// src/components/AudioPlayer.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TrackType } from '../lib/types';
import { CaretRightOutlined, PauseOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';

type Props = {
    track?: TrackType;
    volume: number;
    onEnded: () => void;
    onVolumeChange: (v: number) => void;
    onPlayPauseToggle: () => void;
    isPlaying: boolean;
    isShuffled: boolean;
    isRepeated: boolean;
    handlePrev: () => void;
    handleNext: () => void;
    handleShuffleToggle: () => void;
    handleRepeatToggle: () => void;
    onDurationLoaded?: (trackId: string, duration: number) => void;
};

export default function AudioPlayer({
    track,
    volume,
    onEnded,
    onVolumeChange,
    onPlayPauseToggle,
    isPlaying,
    isShuffled,
    isRepeated,
    handlePrev,
    handleNext,
    handleShuffleToggle,
    handleRepeatToggle,
    onDurationLoaded,
}: Props) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [trackDurations, setTrackDurations] = useState<Map<string, number>>(new Map());

    // State to hold the blob URL
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    // Memoize source: prefer remote URLs over local blob
    const src = useMemo(() => {
        if (!track) return undefined;
        if (track.googleDriveUrl) return track.googleDriveUrl;
        if (track.url) return track.url;
        if (track.file) {
            // Always create a new blob URL for each file to avoid race conditions
            const newBlobUrl = URL.createObjectURL(track.file);
            setBlobUrl(newBlobUrl);
            return newBlobUrl;
        }
        return undefined;
    }, [track?.id, track?.file]); // Only depend on track ID and file, not blobUrl

    // Clean up blob URL when track changes
    useEffect(() => {
        const currentBlobUrl = blobUrl;
        return () => {
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
            }
        };
    }, [track?.id]); // Clean up when track ID changes

    // Clean up blob URL when component unmounts
    useEffect(() => {
        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, []); // Only run on unmount

    // Debug: log when src changes
    useEffect(() => {
        console.log('Audio src changed:', { trackId: track?.id, src, trackName: track?.name });
    }, [src, track]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volume;
    }, [volume]);


    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    }, [isPlaying, src]);

    // Reset progress on new source
    useEffect(() => {
        setCurrentTime(0);
        setDuration(0);
    }, [src]);

    const handleLoadedMetadata = () => {
        const audio = audioRef.current;
        if (!audio || !track) return;
        const trackDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
        console.log('handleLoadedMetadata called:', { trackId: track.id, duration: trackDuration, src });
        setDuration(trackDuration);
        
        // Notify parent component about the duration
        if (onDurationLoaded && trackDuration > 0) {
            onDurationLoaded(track.id, trackDuration);
        }
    };

    const handleTimeUpdate = () => {
        if (isSeeking) return;
        const audio = audioRef.current;
        if (!audio) return;
        setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
        if (isRepeated) {
            // If repeat is enabled, restart the current track
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = 0;
                audio.play().catch((error) => {
                    console.error('Failed to restart track in repeat mode:', error);
                    // If restart fails, fall back to normal behavior
                    onEnded();
                });
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

    const formatTime = (sec: number) => {
        if (!sec || !Number.isFinite(sec)) return '0:00';
        
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const seconds = Math.floor(sec % 60);
        
        // If 1 hour or more, show as H:MM:SS
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        // Otherwise show as MM:SS
        else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    };

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumePercentage = volume * 100;

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

    const trackInfo = track ? parseTrackName(track.name) : { title: 'No track selected', artist: 'Local File' };

    return (
        <div className="player-footer">
            <div className="player-container">
                {/* Track Info */}
                <div className="player-track-info">
                    <div className="player-album-art"></div>
                    <div className="player-text">
                        <div className="player-track-title">
                            {trackInfo.title}
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
                            onClick={onPlayPauseToggle} 
                            disabled={!track}
                        >
                            {isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
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
                    </div>
                    
                    <div className="progress-bar-container">
                        <span className="time-label">{formatTime(currentTime)}</span>
                        <div 
                            className="progress-bar"
                            onMouseDown={(e) => {
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
                                
                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                };
                                
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                            }}
                            onClick={(e) => {
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
                        <span className="time-label">{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Volume Control */}
                <div className="volume-control">
                    <button className="volume-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </button>
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
                            
                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
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

            <audio
                ref={audioRef}
                src={src}
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onError={(e) => {
                    const audio = e.target as HTMLAudioElement;
                    console.error('Audio loading error:', {
                        error: audio.error,
                        networkState: audio.networkState,
                        readyState: audio.readyState,
                        src: audio.src,
                        trackId: track?.id
                    });
                }}
            />
        </div>
    );
}