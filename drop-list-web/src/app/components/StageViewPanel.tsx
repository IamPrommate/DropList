'use client';

import { useEffect, useRef, useState } from 'react';
import { TrackType } from '../lib/types';
import { parseTrackName } from '../../utils/track';
import ScrollingText from './ScrollingText';
import { useVideoRetryRecovery } from '../hooks/useVideoRetryRecovery';

/** Toggle equalizer bars in Stage View */
const isShowEqualizer = true;

/** Toggle progress bar in Stage View */
const isStageViewProgressBar = false;

const TITLE_MAX_WIDTH_WITH_EQ = '230px';
const TITLE_MAX_WIDTH_NO_EQ = '260px';
const STAGE_VIEW_PANEL_DEBUG = true;

type Props = {
  track: TrackType;
  playbackProgress?: number;
};

export default function StageViewPanel({ track, playbackProgress = 0 }: Props) {
  const videoSrc = track.stageViewVideoUrl;
  const info = parseTrackName(track.name);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [infoVisible, setInfoVisible] = useState(true);
  const prevTrackIdRef = useRef(track.id);
  const titleMeasureRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const titleMaxWidth = isShowEqualizer ? TITLE_MAX_WIDTH_WITH_EQ : TITLE_MAX_WIDTH_NO_EQ;
  const { handleVideoRecovered, handleVideoError } = useVideoRetryRecovery({
    trackId: track.id,
    videoSrc,
    debug: true,
  });

  useEffect(() => {
    if (!STAGE_VIEW_PANEL_DEBUG) return;
    console.log('[StageViewPanelDebug] mounted', {
      trackId: track.id,
      videoSrc,
    });

    return () => {
      console.log('[StageViewPanelDebug] unmounted', {
        trackId: track.id,
        videoSrc,
      });
    };
  }, [track.id, videoSrc]);

  useEffect(() => {
    // Reset loading state when the video source changes (new artist/track)
    setIsVideoReady(false);
  }, [videoSrc]);

  // Crossfade info on track change
  useEffect(() => {
    if (prevTrackIdRef.current !== track.id) {
      setInfoVisible(false);
      const timer = setTimeout(() => {
        setInfoVisible(true);
        prevTrackIdRef.current = track.id;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [track.id]);

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

  if (!videoSrc) return null;

  return (
    <div className="stage-view-panel">
      <div className="stage-view-video-wrapper">
        {!isVideoReady && (
          <>
            <div className="stage-view-skeleton" />
            <div className="stage-view-spinner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
          </>
        )}
        <video
          ref={videoRef}
          className="stage-view-video"
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay
          onLoadedData={(e) => {
            setIsVideoReady(true);
            if (STAGE_VIEW_PANEL_DEBUG) {
              console.log('[StageViewPanelDebug] video loaded', {
                trackId: track.id,
                videoSrc,
              });
            }
            handleVideoRecovered(e.currentTarget);
          }}
          onError={(e) => {
            setIsVideoReady(false);
            if (STAGE_VIEW_PANEL_DEBUG) {
              console.log('[StageViewPanelDebug] video error', {
                trackId: track.id,
                videoSrc,
              });
            }
            handleVideoError(e);
          }}
        />
      </div>
      {/* Progress bar – flush under video, no overlap */}
      {isStageViewProgressBar && (
        <div className="stage-view-progress-bar">
          <div
            className="stage-view-progress-fill"
            style={{ width: `${playbackProgress * 100}%` }}
          />
        </div>
      )}
      <div className={`stage-view-info ${infoVisible ? 'stage-view-info-visible' : 'stage-view-info-hidden'}`}>
        <div className="stage-view-track-title">
          {isShowEqualizer && (
            <div className="stage-eq-bars">
              <span /><span /><span /><span />
            </div>
          )}
          {/* Hidden measurer: single-line, fixed width */}
          <div
            ref={titleMeasureRef}
            style={{
              position: 'absolute',
              visibility: 'hidden',
              whiteSpace: 'nowrap',
              fontSize: '0.95rem',
              fontWeight: 600,
              maxWidth: titleMaxWidth,
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
              containerWidth={`w-[${titleMaxWidth}]`}
              animationDuration="16s"
              animationDelay="1s"
            />
          ) : (
            <div
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: titleMaxWidth,
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
