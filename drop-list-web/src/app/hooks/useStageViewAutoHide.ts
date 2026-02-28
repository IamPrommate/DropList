'use client';

import { useLayoutEffect, useRef, useState } from 'react';

const STAGE_VIEW_HIDE_ON_GAP_LESS_THAN = 36;
const STAGE_VIEW_SHOW_ON_GAP_AT_LEAST = 24;
const STAGE_VIEW_MOBILE_BREAKPOINT = 1023;

function getGapBetweenPlaylistAndStageView(
  playlistEl: HTMLDivElement,
  stageViewEl: HTMLElement
): number {
  const playlistRect = playlistEl.getBoundingClientRect();
  const stageViewRect = stageViewEl.getBoundingClientRect();
  return stageViewRect.left - playlistRect.right;
}

function getNextStageViewAutoHidden(prevHidden: boolean, gapBetweenPlaylistAndStage: number): boolean {
  return prevHidden
    ? gapBetweenPlaylistAndStage < STAGE_VIEW_SHOW_ON_GAP_AT_LEAST
    : gapBetweenPlaylistAndStage < STAGE_VIEW_HIDE_ON_GAP_LESS_THAN;
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

    const checkShouldAutoHide = () => {
      if (window.innerWidth <= STAGE_VIEW_MOBILE_BREAKPOINT) {
        setIsStageViewAutoHidden(true);
        return;
      }

      const playlistEl = playlistRef.current;
      const stageViewEl = document.querySelector('.stage-view-panel') as HTMLElement | null;
      if (!playlistEl || !stageViewEl) {
        return;
      }

      const gapBetweenPlaylistAndStage = getGapBetweenPlaylistAndStageView(playlistEl, stageViewEl);
      setIsStageViewAutoHidden((prev) => getNextStageViewAutoHidden(prev, gapBetweenPlaylistAndStage));
    };

    const scheduleCheck = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        checkShouldAutoHide();
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
