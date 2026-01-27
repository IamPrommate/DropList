'use client';

import { useEffect, useState } from 'react';
import { TrackType } from '../lib/types';
import { parseTrackName } from '../../utils/track';

type Props = {
  track: TrackType;
};

export default function StageViewPanel({ track }: Props) {
  const videoSrc = track.stageViewVideoUrl;

  if (!videoSrc) return null;

  const info = parseTrackName(track.name);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    // Reset loading state when the video source changes (new artist/track)
    setIsVideoReady(false);
  }, [videoSrc]);

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
          className={`stage-view-video ${isVideoReady ? 'stage-view-video-ready' : ''}`}
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
        <div className="stage-view-track-title">{info.title}</div>
        <div className="stage-view-primary-meta">
          <span className="stage-view-performer">{info.artist}</span>
        </div>
      </div>
    </div>
  );
}

