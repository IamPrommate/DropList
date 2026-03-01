'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';

type UseVideoRetryRecoveryArgs = {
  trackId?: string;
  videoSrc?: string | null;
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  debug?: boolean;
};

export function useVideoRetryRecovery({
  trackId,
  videoSrc,
  maxRetryAttempts = 3,
  retryDelayMs = 1000,
  debug = true,
}: UseVideoRetryRecoveryArgs) {
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryKeyRef = useRef<string | null>(null);

  const logVideoRetryDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!debug) return;
    console.log(`[VideoRetry] ${event}`, payload ?? {});
  }, [debug]);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const resetRetryState = useCallback((key?: string | null) => {
    clearRetryTimeout();
    retryCountRef.current = 0;
    retryKeyRef.current = key ?? null;
  }, [clearRetryTimeout]);

  useEffect(() => {
    resetRetryState(videoSrc ?? trackId ?? null);
  }, [videoSrc, trackId, resetRetryState]);

  useEffect(() => {
    return () => {
      clearRetryTimeout();
    };
  }, [clearRetryTimeout]);

  const handleVideoRecovered = useCallback((video: HTMLVideoElement) => {
    const retriesUsed = retryCountRef.current;
    if (retriesUsed > 0) {
      logVideoRetryDebug('source recovered', {
        trackId,
        src: video.currentSrc || video.src,
        retriesUsed,
        readyState: video.readyState,
        networkState: video.networkState,
      });
      // For recovered streams, force resume playback to avoid staying paused.
      video.play().catch((error) => {
        console.error('Video auto-resume after recovery failed:', error);
        logVideoRetryDebug('auto-resume failed', {
          trackId,
          src: video.currentSrc || video.src,
          error,
        });
      });
    }
    resetRetryState(video.currentSrc || video.src || videoSrc || trackId || null);
  }, [logVideoRetryDebug, resetRetryState, trackId, videoSrc]);

  const handleVideoError = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const key = trackId ?? video.currentSrc ?? video.src ?? videoSrc ?? null;

    if (retryKeyRef.current !== key) {
      resetRetryState(key);
    }

    logVideoRetryDebug('error received', {
      trackId,
      src: video.currentSrc || video.src,
      retryCount: retryCountRef.current,
      maxRetries: maxRetryAttempts,
      networkState: video.networkState,
      readyState: video.readyState,
      errorCode: video.error?.code,
      errorMessage: video.error?.message,
      timestamp: new Date().toISOString(),
    });

    if (!video.src) {
      return;
    }

    if (retryCountRef.current >= maxRetryAttempts) {
      console.error(`Video failed after ${maxRetryAttempts} retries.`, {
        trackId,
        src: video.currentSrc || video.src,
      });
      logVideoRetryDebug('max retries reached', {
        trackId,
        src: video.currentSrc || video.src,
      });
      resetRetryState(key);
      return;
    }

    if (retryTimeoutRef.current) {
      return;
    }

    retryCountRef.current += 1;
    const attempt = retryCountRef.current;
    console.warn(`Video source load failed. Retrying ${attempt}/${maxRetryAttempts}...`, {
      trackId,
      src: video.currentSrc || video.src,
    });
    logVideoRetryDebug('retry scheduled', {
      trackId,
      src: video.currentSrc || video.src,
      attempt,
      delayMs: retryDelayMs,
    });

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      logVideoRetryDebug('retry load() fired', {
        trackId,
        src: video.currentSrc || video.src,
        attempt,
      });
      video.load();
    }, retryDelayMs);
  }, [logVideoRetryDebug, maxRetryAttempts, retryDelayMs, resetRetryState, trackId, videoSrc]);

  return {
    handleVideoRecovered,
    handleVideoError,
  };
}
