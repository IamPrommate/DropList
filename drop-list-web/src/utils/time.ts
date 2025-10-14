/**
 * Format seconds into a human-readable time string
 * @param seconds - The number of seconds to format
 * @returns Formatted time string (MM:SS or H:MM:SS)
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  // If 1 hour or more, show as H:MM:SS
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  // Otherwise show as MM:SS
  else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Parse a time string and convert to seconds
 * @param timeString - Time string in format MM:SS or H:MM:SS
 * @returns Number of seconds
 */
export function parseTimeString(timeString: string): number {
  const parts = timeString.split(':').map(part => parseInt(part, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // H:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return 0;
}

/**
 * Get the total duration of multiple tracks
 * @param tracks - Array of tracks with duration information
 * @param getDuration - Function to extract duration from a track
 * @returns Total duration in seconds
 */
export function getTotalDuration<T>(
  tracks: T[], 
  getDuration: (track: T) => number
): number {
  return tracks.reduce((total, track) => {
    const duration = getDuration(track);
    return total + (duration || 0);
  }, 0);
}
