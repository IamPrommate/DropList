'use client';

import { useLayoutEffect, useRef, useState } from 'react';

const STAGE_VIEW_MOBILE_BREAKPOINT = 1023;
const STAGE_VIEW_MIN_REQUIRED_GAP_PX = 12;

function getGapBetweenPlaylistAndStageView(
  playlistEl: HTMLDivElement,
  stageViewEl: HTMLElement
): number {
  const playlistRect = playlistEl.getBoundingClientRect();
  const stageViewRect = stageViewEl.getBoundingClientRect();
  return stageViewRect.left - playlistRect.right;
}

type UseStageViewAutoHideArgs = {
  enabled: boolean;
  layoutDependency?: unknown;
};

export function useStageViewAutoHide({ enabled, layoutDependency }: UseStageViewAutoHideArgs) {
  const playlistRef = useRef<HTMLDivElement | null>(null);
  const [isStageViewAutoHidden, setIsStageViewAutoHidden] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) {
      setIsStageViewAutoHidden(false);
      return;
    }

    let frameId: number | null = null;

    const evaluateVisibility = () => {
      const viewportWidth = window.innerWidth;

      if (viewportWidth <= STAGE_VIEW_MOBILE_BREAKPOINT) {
        setIsStageViewAutoHidden(true);
        return;
      }

      const playlistEl = playlistRef.current;
      const stageViewEl = document.querySelector('.stage-view-panel') as HTMLElement | null;
      if (!playlistEl || !stageViewEl) {
        // Measurement can be temporarily unavailable during mount/layout transitions.
        // Keep current visibility state to avoid hide/show flicker.
        return;
      }

      const gapBetweenPlaylistAndStage = getGapBetweenPlaylistAndStageView(playlistEl, stageViewEl);
      setIsStageViewAutoHidden(gapBetweenPlaylistAndStage < STAGE_VIEW_MIN_REQUIRED_GAP_PX);
    };

    const scheduleCheck = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        evaluateVisibility();
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleCheck();
    });

    if (playlistRef.current) {
      resizeObserver.observe(playlistRef.current);
    }

    scheduleCheck();
    window.addEventListener('resize', scheduleCheck);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleCheck);
    };
  }, [enabled, layoutDependency]);

  return { playlistRef, isStageViewAutoHidden };
}
