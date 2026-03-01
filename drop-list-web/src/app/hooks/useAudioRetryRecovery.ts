'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';

type UseAudioRetryRecoveryArgs = {
  trackId?: string;
  isPlaying: boolean;
  handleNext: () => void;
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  debug?: boolean;
};

const RECOVERY_PAUSE_SYNC_GRACE_MS = 2000;

export function useAudioRetryRecovery({
  trackId,
  isPlaying,
  handleNext,
  maxRetryAttempts = 3,
  retryDelayMs = 1000,
  debug = true,
}: UseAudioRetryRecoveryArgs) {
  const audioLoadRetryCountRef = useRef(0);
  const audioLoadRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTrackKeyRef = useRef<string | null>(null);
  const intendedPlayingRef = useRef(isPlaying);
  const shouldResumeAfterRecoveryRef = useRef(false);
  const isRecoveringRef = useRef(false);
  const recoveryPauseSyncGraceUntilRef = useRef(0);

  const logAudioRetryDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!debug) return;
    console.log(`[AudioRetry] ${event}`, payload ?? {});
  }, [debug]);

  const clearAudioRetryTimeout = useCallback(() => {
    if (audioLoadRetryTimeoutRef.current) {
      clearTimeout(audioLoadRetryTimeoutRef.current);
      audioLoadRetryTimeoutRef.current = null;
    }
  }, []);

  const resetAudioRetryState = useCallback((trackKey?: string | null) => {
    clearAudioRetryTimeout();
    audioLoadRetryCountRef.current = 0;
    retryTrackKeyRef.current = trackKey ?? null;
    shouldResumeAfterRecoveryRef.current = false;
    isRecoveringRef.current = false;
    recoveryPauseSyncGraceUntilRef.current = 0;
  }, [clearAudioRetryTimeout]);

  useEffect(() => {
    intendedPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      clearAudioRetryTimeout();
    };
  }, [clearAudioRetryTimeout]);

  const handleAudioRecovered = useCallback((audio: HTMLAudioElement, recoveredTrackId?: string) => {
    const recoveredAfterRetries = audioLoadRetryCountRef.current;

    if (recoveredAfterRetries > 0) {
      logAudioRetryDebug('source recovered', {
        trackId: recoveredTrackId ?? trackId,
        src: audio.currentSrc || audio.src,
        retriesUsed: recoveredAfterRetries,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
    }

    const shouldAutoResume = recoveredAfterRetries > 0
      && shouldResumeAfterRecoveryRef.current
      && intendedPlayingRef.current;

    resetAudioRetryState(recoveredTrackId ?? trackId ?? audio.currentSrc ?? audio.src);
    if (recoveredAfterRetries > 0) {
      recoveryPauseSyncGraceUntilRef.current = Date.now() + RECOVERY_PAUSE_SYNC_GRACE_MS;
    }

    if (shouldAutoResume) {
      logAudioRetryDebug('attempting auto-resume after recovery', {
        trackId: recoveredTrackId ?? trackId,
        src: audio.currentSrc || audio.src,
      });
      audio.play().catch((error) => {
        console.error('Auto-resume after recovery failed:', error);
      });
    }
  }, [logAudioRetryDebug, resetAudioRetryState, trackId]);

  const handleAudioError = useCallback((e: SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const activeTrackId = trackId;
    const trackKey = activeTrackId ?? audio.currentSrc ?? audio.src ?? null;

    if (retryTrackKeyRef.current !== trackKey) {
      resetAudioRetryState(trackKey);
    }
    shouldResumeAfterRecoveryRef.current = intendedPlayingRef.current;

    console.error('Audio loading error:', {
      error: audio.error,
      errorCode: audio.error?.code,
      errorMessage: audio.error?.message,
      networkState: audio.networkState,
      readyState: audio.readyState,
      src: audio.src,
      trackId: activeTrackId,
    });

    logAudioRetryDebug('error received', {
      trackId: activeTrackId,
      trackKey,
      src: audio.currentSrc || audio.src,
      retryCount: audioLoadRetryCountRef.current,
      maxRetries: maxRetryAttempts,
      networkState: audio.networkState,
      readyState: audio.readyState,
      errorCode: audio.error?.code,
      errorMessage: audio.error?.message,
      timestamp: new Date().toISOString(),
    });

    if (!audio.src) {
      return;
    }

    if (audioLoadRetryCountRef.current >= maxRetryAttempts) {
      console.error(
        `Audio failed after ${maxRetryAttempts} retries. Skipping to next track.`,
        { src: audio.src, trackId: activeTrackId }
      );
      logAudioRetryDebug('max retries reached; skipping next track', {
        trackId: activeTrackId,
        src: audio.currentSrc || audio.src,
        retriesUsed: audioLoadRetryCountRef.current,
      });
      resetAudioRetryState(trackKey);
      handleNext();
      return;
    }

    // Avoid stacking multiple scheduled retries from repeated onError events.
    if (audioLoadRetryTimeoutRef.current) {
      return;
    }

    audioLoadRetryCountRef.current += 1;
    const attempt = audioLoadRetryCountRef.current;
    isRecoveringRef.current = true;
    console.warn(
      `Audio source load failed. Retrying ${attempt}/${maxRetryAttempts}...`,
      { src: audio.src, trackId: activeTrackId }
    );
    logAudioRetryDebug('retry scheduled', {
      trackId: activeTrackId,
      src: audio.currentSrc || audio.src,
      attempt,
      delayMs: retryDelayMs,
    });

    audioLoadRetryTimeoutRef.current = setTimeout(() => {
      audioLoadRetryTimeoutRef.current = null;
      logAudioRetryDebug('retry load() fired', {
        trackId: activeTrackId,
        src: audio.currentSrc || audio.src,
        attempt,
      });
      audio.load();
    }, retryDelayMs);
  }, [handleNext, logAudioRetryDebug, maxRetryAttempts, resetAudioRetryState, retryDelayMs, trackId]);

  const shouldSuppressPauseSync = useCallback((audio?: HTMLAudioElement | null) => {
    if (!audio) return false;
    const inRecoveryWindow =
      isRecoveringRef.current || Date.now() < recoveryPauseSyncGraceUntilRef.current;
    const suppress = inRecoveryWindow
      && shouldResumeAfterRecoveryRef.current
      && intendedPlayingRef.current
      && Boolean(audio.src)
      && !audio.ended;

    if (suppress) {
      logAudioRetryDebug('pause-sync suppressed during recovery window', {
        trackId,
        src: audio.currentSrc || audio.src,
        inRecoveryWindow,
        shouldResumeAfterRecovery: shouldResumeAfterRecoveryRef.current,
        intendedPlaying: intendedPlayingRef.current,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
    }
    return suppress;
  }, [logAudioRetryDebug, trackId]);

  return {
    clearAudioRetryTimeout,
    resetAudioRetryState,
    handleAudioRecovered,
    handleAudioError,
    shouldSuppressPauseSync,
  };
}
