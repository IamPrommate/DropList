'use client';

import { memo } from 'react';
import { Music } from 'lucide-react';
import { formatDuration } from '../../utils/time';
import Spinner from './Spinner';

interface TrackItemProps {
  index: number;
  trackId: string;
  title: string;
  artist: string;
  isActive: boolean;
  isPlaying: boolean;
  isFree: boolean;
  duration: number;
  durationLoaded: boolean;
  durationLoading: boolean;
  onClick: (index: number) => void;
}

function TrackItem({
  index,
  title,
  artist,
  isActive,
  isPlaying,
  isFree,
  duration,
  durationLoaded,
  durationLoading,
  onClick,
}: TrackItemProps) {
  return (
    <div
      className={`track-item ${isActive ? 'active' : ''} ${isFree ? 'track-item-locked' : ''}`}
      onClick={() => onClick(index)}
    >
      <div className="track-number">{index + 1}</div>
      <div className="track-thumb-image" aria-hidden>
        <div className="track-thumb-placeholder">
          <Music size={22} strokeWidth={1.75} />
        </div>
      </div>
      <div className="track-splitter"></div>
      <div className="track-info">
        <div className="track-title">
          {isActive && isPlaying && <div className="running-track-indicator"></div>}
          {title}
        </div>
        <div className="track-artist">{artist}</div>
      </div>
      <div className="track-duration">
        {durationLoading ? (
          <div className="duration-spinner"><Spinner size={12} /></div>
        ) : durationLoaded ? (
          formatDuration(duration)
        ) : (
          <div className="duration-spinner"><Spinner size={12} /></div>
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
}

export default memo(TrackItem);
