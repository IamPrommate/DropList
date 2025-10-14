export interface ParsedTrackInfo {
  title: string;
  artist: string;
}

/**
 * Parse track name to extract title and artist information
 * Supports various naming patterns commonly used in music files
 * 
 * @param name - The track name/filename to parse
 * @returns Object containing parsed title and artist
 */
export function parseTrackName(name: string): ParsedTrackInfo {
  // Remove file extension first
  const nameWithoutExt = name.replace(/\.[^/.]+$/, '');
  
  // Try to match pattern: "Title (Artist)" or "Title(Artist)"
  const match = nameWithoutExt.match(/^(.+?)\s*\(([^)]+)\)/);
  if (match) {
    return {
      title: match[1].trim(),
      artist: match[2].trim()
    };
  }
  
  // If no parentheses, try to extract artist from common patterns
  // Look for patterns like "Title - Artist" or "Title by Artist"
  const dashMatch = nameWithoutExt.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      artist: dashMatch[2].trim()
    };
  }
  
  const byMatch = nameWithoutExt.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim()
    };
  }
  
  return {
    title: nameWithoutExt,
    artist: 'Local File'
  };
}

/**
 * Generate a unique ID for tracks
 * @returns A random string ID
 */
export function generateTrackId(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Check if a file is a valid audio file based on its type and extension
 * @param file - The file to check
 * @returns True if the file is a valid audio file
 */
export function isValidAudioFile(file: File): boolean {
  const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac'];
  const validExtensions = /\.(mp3|wav|ogg|m4a|flac)$/i;
  
  return validTypes.includes(file.type) || validExtensions.test(file.name);
}

/**
 * Filter an array of files to only include valid audio files
 * @param files - Array of files to filter
 * @returns Array of valid audio files
 */
export function filterAudioFiles(files: FileList | File[]): File[] {
  const fileArray = Array.from(files);
  return fileArray.filter(isValidAudioFile);
}

/**
 * Extract folder name from file path (for directory uploads)
 * @param file - File with webkitRelativePath property
 * @returns Folder name or null if not available
 */
export function extractFolderName(file: File & { webkitRelativePath?: string }): string | null {
  const rel = file.webkitRelativePath;
  if (rel && rel.includes('/')) {
    return rel.split('/')[0];
  }
  return null;
}
