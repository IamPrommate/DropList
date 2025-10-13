// src/components/AudioPlayer.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TrackType } from '../lib/types';
import { Button, Slider, Space, Typography } from 'antd';
import { CaretRightOutlined, LeftOutlined, PauseOutlined, RightOutlined, StepBackwardOutlined, StepForwardFilled, StepForwardOutlined, SwapOutlined } from '@ant-design/icons';
const { Text } = Typography;

type Props = {
    track?: TrackType;
    volume: number;
    onEnded: () => void;
    onVolumeChange: (v: number) => void;
    onPlayPauseToggle: () => void;
    isPlaying: boolean;
    isShuffled: boolean;
    handlePrev: () => void;
    handleNext: () => void;
    handleShuffleToggle: () => void;
};

export default function AudioPlayer({
    track,
    volume,
    onEnded,
    onVolumeChange,
    onPlayPauseToggle,
    isPlaying,
    isShuffled,
    handlePrev,
    handleNext,
    handleShuffleToggle,
}: Props) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);

    // Memoize blob URL so it doesn't recreate on every render
    const src = useMemo(() => {
        if (track?.file) {
            return URL.createObjectURL(track.file);
        }
        return track?.url;
    }, [track]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volume;
    }, [volume]);

    useEffect(() => {
        return () => {
            if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
        };
    }, [src]);

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
        if (!audio) return;
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleTimeUpdate = () => {
        if (isSeeking) return;
        const audio = audioRef.current;
        if (!audio) return;
        setCurrentTime(audio.currentTime || 0);
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
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="audioBar">
            <div className="audioPlayer">
                
                <div className='leftPlayer'>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 260 }}>
                    <Text type="secondary" style={{ width: 44, textAlign: 'right' }}>{formatTime(currentTime)}</Text>
                    <Slider
                        className="musicSlider"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        onChange={(value) => {
                            handleSeekStart();
                            handleSeekChange(value);
                        }}
                        onAfterChange={handleSeekEnd}
                        disabled={!track || !duration}
                    />
                    <Text type="secondary" style={{ width: 44 }}>{formatTime(duration)}</Text>
                </div>
                    
                    <Button onClick={onPlayPauseToggle} disabled={!track} type="text">
                        {isPlaying ? <PauseOutlined className="text-xl" /> : <CaretRightOutlined className="text-xl" />}
                    </Button>
                </div>

                <div className='rightPlayer'>
                    <Button onClick={handleNext} disabled={!track} type="text"><StepBackwardOutlined className="text-xl" /></Button>
                    <Button onClick={handlePrev} disabled={!track} type="text"><StepForwardFilled className="text-xl" /></Button>
                    <Button type="text" onClick={handleShuffleToggle} disabled={!track}>
                        <SwapOutlined />
                    </Button>
                </div>

                <div className='volumeGroup'>
                <Text type="secondary">Volume</Text>
                    <Slider
                        className="volumeSlider"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(v) => onVolumeChange(Array.isArray(v) ? v[0] : v)}
                        disabled={!track}
                    />
                    <audio
                        ref={audioRef}
                        src={src}
                        onEnded={onEnded}
                        onLoadedMetadata={handleLoadedMetadata}
                        onTimeUpdate={handleTimeUpdate}
                    />
                </div>
            </div>
        </div>
    );
}