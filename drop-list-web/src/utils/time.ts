import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

/**
 * Format seconds into a human-readable time string
 * @param seconds - The number of seconds to format
 * @returns Formatted time string (MM:SS or H:MM:SS)
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';

  const d = dayjs.duration(seconds, 'seconds');
  const hours = Math.floor(d.asHours());
  const minutes = d.minutes();
  const secs = d.seconds();

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
    return Math.floor(dayjs.duration({ minutes, seconds }).asSeconds());
  } else if (parts.length === 3) {
    // H:MM:SS format
    const [hours, minutes, seconds] = parts;
    return Math.floor(dayjs.duration({ hours, minutes, seconds }).asSeconds());
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

/**
 * Format remaining milliseconds into MM:SS countdown text.
 * Uses ceil so the timer counts naturally (30:00 -> 29:59 -> 29:58).
 */
export function formatCountdownMMSS(remainingMs: number): string {
  const d = dayjs.duration(Math.max(0, remainingMs));
  const totalSeconds = Math.ceil(d.asSeconds());
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
