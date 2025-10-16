// Common enums and constants for the application

export enum FileType {
  AUDIO = 'audio',
  IMAGE = 'image'
}

export enum AudioExtension {
  MP3 = '.mp3',
  WAV = '.wav',
  OGG = '.ogg',
  M4A = '.m4a',
  FLAC = '.flac'
}

export enum ImageExtension {
  JPG = '.jpg',
  JPEG = '.jpeg',
  PNG = '.png',
  GIF = '.gif',
  WEBP = '.webp',
  BMP = '.bmp',
  SVG = '.svg'
}

// Helper functions to check file types
export function isAudioFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return Object.values(AudioExtension).some(ext => lowerName.endsWith(ext));
}

export function isImageFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return Object.values(ImageExtension).some(ext => lowerName.endsWith(ext));
}

// Get all audio extensions as array
export function getAudioExtensions(): string[] {
  return Object.values(AudioExtension);
}

// Get all image extensions as array
export function getImageExtensions(): string[] {
  return Object.values(ImageExtension);
}
