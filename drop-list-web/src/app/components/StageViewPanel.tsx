'use client';

import { useEffect, useRef, useState } from 'react';
import { TrackType } from '../lib/types';
import { parseTrackName } from '../../utils/track';
import ScrollingText from './ScrollingText';

type Props = {
  track: TrackType;
};

export default function StageViewPanel({ track }: Props) {
  const videoSrc = track.stageViewVideoUrl;

  if (!videoSrc) return null;

  const info = parseTrackName(track.name);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const titleMeasureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset loading state when the video source changes (new artist/track)
    setIsVideoReady(false);
  }, [videoSrc]);

  // Decide whether track title should scroll (single line only)
  useEffect(() => {
    const el = titleMeasureRef.current;
    if (!el) return;

    const check = () => {
      const isOverflowing = el.scrollWidth > el.clientWidth;
      setShouldScroll(isOverflowing);
    };

    setShouldScroll(false);
    check();
    const id = setTimeout(check, 150);
    return () => clearTimeout(id);
  }, [info.title, track.id]);

  return (
    <div className="stage-view-panel">
      <div className="stage-view-video-wrapper">
        {!isVideoReady && (
          <div className="stage-view-spinner">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          </div>
        )}
        <video
          className="stage-view-video"
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay
          onLoadedData={() => setIsVideoReady(true)}
          onError={() => setIsVideoReady(true)}
        />
      </div>
      <div className="stage-view-info">
        <div className="stage-view-track-title">
          {/* Hidden measurer: single-line, fixed width */}
          <div
            ref={titleMeasureRef}
            style={{
              position: 'absolute',
              visibility: 'hidden',
              whiteSpace: 'nowrap',
              fontSize: '0.95rem',
              fontWeight: 600,
              maxWidth: '260px',
              overflow: 'hidden',
            }}
          >
            {info.title}
          </div>

          {shouldScroll ? (
            <ScrollingText
              key={`stage-scroll-${track.id || info.title}`}
              text={info.title}
              className="text-sm font-semibold"
              containerWidth="w-[260px]"
              animationDuration="16s"
              animationDelay="1s"
            />
          ) : (
            <div
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '260px',
              }}
            >
              {info.title}
            </div>
          )}
        </div>
        <div className="stage-view-primary-meta">
          <span className="stage-view-performer">{info.artist}</span>
        </div>
      </div>
    </div>
  );
}

