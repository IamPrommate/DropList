import { shuffle } from 'lodash';
import { TrackType } from '../app/lib/types';

export interface ShuffleState {
  queue: number[];
  queueIndex: number;
  recentlyPlayed: number[];
}

export interface ShuffleOptions {
  excludeIndices?: number[];
  recentlyPlayed?: number[];
  maxRecentHistory?: number;
}

/**
 * Generate a shuffled queue of track indices avoiding predictable patterns
 */
export function generateShuffleQueue(
  tracks: TrackType[], 
  options: ShuffleOptions = {}
): number[] {
  const { excludeIndices = [], recentlyPlayed = [], maxRecentHistory = 2 } = options;
  
  const indices = tracks.map((_, index) => index);
  const availableIndices = indices.filter(index => !excludeIndices.includes(index));
  
  // If we have enough tracks, avoid recently played ones
  let candidates = availableIndices;
  if (availableIndices.length > 2 && recentlyPlayed.length > 0) {
    // Exclude recently played tracks to avoid patterns
    const recentCount = Math.min(maxRecentHistory, recentlyPlayed.length);
    const recentTracks = recentlyPlayed.slice(-recentCount);
    candidates = availableIndices.filter(index => !recentTracks.includes(index));
    
    // If we filtered out too many, fall back to all available
    if (candidates.length === 0) {
      candidates = availableIndices;
    }
  }
  
  return shuffle(candidates);
}

/**
 * Update recently played history with a new track
 */
export function updateRecentlyPlayed(
  currentHistory: number[], 
  newTrackIndex: number, 
  maxHistory: number = 5
): number[] {
  const updated = [...currentHistory, newTrackIndex];
  return updated.slice(-maxHistory);
}

/**
 * Create initial shuffle state for a playlist
 */
export function createInitialShuffleState(
  tracks: TrackType[], 
  currentIndex: number
): ShuffleState {
  if (tracks.length <= 1) {
    return {
      queue: [],
      queueIndex: 0,
      recentlyPlayed: []
    };
  }

  const queue = generateShuffleQueue(tracks, { excludeIndices: [currentIndex] });
  
  return {
    queue,
    queueIndex: 0,
    recentlyPlayed: [currentIndex]
  };
}

/**
 * Get next track from shuffle queue or generate new one
 */
export function getNextShuffleTrack(
  tracks: TrackType[],
  currentIndex: number,
  shuffleState: ShuffleState
): { nextIndex: number; newState: ShuffleState } | null {
  if (tracks.length === 0) return null;
  
  // Handle single track case
  if (tracks.length === 1) {
    return null; // Don't change track
  }

  const { queue, queueIndex, recentlyPlayed } = shuffleState;
  
  // Check if we need to generate a new shuffle queue
  if (queue.length === 0 || queueIndex >= queue.length) {
    // Generate new shuffle queue EXCLUDING current track and recently played
    const newQueue = generateShuffleQueue(tracks, { 
      excludeIndices: [currentIndex],
      recentlyPlayed 
    });
    
    const nextIndex = newQueue[0];
    const newRecentlyPlayed = updateRecentlyPlayed(recentlyPlayed, currentIndex);
    
    return {
      nextIndex,
      newState: {
        queue: newQueue,
        queueIndex: 1, // Set to next position since we're about to play first track
        recentlyPlayed: newRecentlyPlayed
      }
    };
  } else {
    // Use the next track in the current queue
    const nextIndex = queue[queueIndex];
    const newRecentlyPlayed = updateRecentlyPlayed(recentlyPlayed, currentIndex);
    
    return {
      nextIndex,
      newState: {
        queue,
        queueIndex: queueIndex + 1,
        recentlyPlayed: newRecentlyPlayed
      }
    };
  }
}

/**
 * Get previous track from shuffle queue or generate new one
 */
export function getPrevShuffleTrack(
  tracks: TrackType[],
  currentIndex: number,
  shuffleState: ShuffleState
): { prevIndex: number; newState: ShuffleState } | null {
  if (tracks.length === 0) return null;
  
  // Handle single track case
  if (tracks.length === 1) {
    return null; // Don't change track
  }

  const { queue, queueIndex } = shuffleState;
  
  // For shuffle mode, go back in the queue or generate a new one
  if (queueIndex > 0) {
    // Go back to previous track in queue
    const prevIndex = queue[queueIndex - 1];
    
    return {
      prevIndex,
      newState: {
        ...shuffleState,
        queueIndex: queueIndex - 1
      }
    };
  } else {
    // Generate new shuffle queue EXCLUDING current track
    const indices = tracks.map((_, index) => index);
    const filteredIndices = indices.filter(index => index !== currentIndex);
    const newQueue = shuffle(filteredIndices);
    
    // Play the last track from the new queue (going backwards)
    const startIndex = newQueue.length - 1;
    const prevIndex = newQueue[startIndex];
    
    return {
      prevIndex,
      newState: {
        queue: newQueue,
        queueIndex: startIndex,
        recentlyPlayed: shuffleState.recentlyPlayed
      }
    };
  }
}

/**
 * Handle manual track selection in shuffle mode
 */
export function handleManualTrackSelection(
  tracks: TrackType[],
  selectedIndex: number,
  _currentShuffleState: ShuffleState
): ShuffleState {
  // Generate new shuffle queue excluding the selected track
  const newQueue = generateShuffleQueue(tracks, { excludeIndices: [selectedIndex] });
  
  return {
    queue: newQueue,
    queueIndex: 0,
    recentlyPlayed: [selectedIndex] // Start history with selected track
  };
}

/**
 * Reset shuffle state (for when tracks change or shuffle is disabled)
 */
export function resetShuffleState(): ShuffleState {
  return {
    queue: [],
    queueIndex: 0,
    recentlyPlayed: []
  };
}
