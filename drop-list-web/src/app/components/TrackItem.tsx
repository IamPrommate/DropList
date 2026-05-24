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
  showArtistImages?: boolean;
  artistImageUrl?: string;
  imageLoading?: boolean;
  onImageLoad?: (trackId: string) => void;
  onImageError?: (trackId: string) => void;
  onClick: (index: number) => void;
}

function TrackItem({
  index,
  trackId,
  title,
  artist,
  isActive,
  isPlaying,
  isFree,
  duration,
  durationLoaded,
  durationLoading,
  showArtistImages = false,
  artistImageUrl,
  imageLoading = false,
  onImageLoad,
  onImageError,
  onClick,
}: TrackItemProps) {
  return (
    <div
      className={`track-item ${isActive ? 'active' : ''} ${isFree ? 'track-item-locked' : ''}`}
      onClick={() => onClick(index)}
    >
      <div className="track-number">{index + 1}</div>
      {showArtistImages && (
        <>
          <div className="track-thumb-image">
            {artistImageUrl ? (
              <>
                <img
                  src={artistImageUrl}
                  alt={artist}
                  className="artist-thumbnail"
                  onLoad={() => onImageLoad?.(trackId)}
                  onError={() => onImageError?.(trackId)}
                />
                {imageLoading && (
                  <div className="artist-image-spinner">
                    <Spinner size={12} />
                  </div>
                )}
              </>
            ) : (
              <div className="track-thumb-placeholder">
                <Music size={22} strokeWidth={1.75} />
              </div>
            )}
          </div>
          <div className="track-splitter"></div>
        </>
      )}
      <div className="track-info">
        <div className="track-title">
          {isActive && isPlaying && <div className="running-track-indicator"></div>}
          <span className="track-title-text">{title}</span>
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
    </div>
  );
}

export default memo(TrackItem);
