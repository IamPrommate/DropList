/**
 * Extract the dominant color from an image
 * @param imageUrl - URL of the image
 * @returns Promise with the dominant color as hex string
 */
const DEFAULT_DOMINANT_COLOR = '#00f594';
const albumColorMemoryCache = new Map<string, string>();
const LOCAL_CACHE_PREFIX = 'droplist:album-color:v2:';

type ColorBucket = {
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
};

function getAlbumColorCacheKey(imageUrl: string): string {
  try {
    const url = new URL(imageUrl, typeof window !== 'undefined' ? window.location.origin : 'https://example.com');
    const driveId = url.searchParams.get('id');
    if (driveId) return `drive:${driveId}`;
    return `${url.origin}${url.pathname}`;
  } catch {
    return imageUrl;
  }
}

function readCachedAlbumColor(cacheKey: string): string | null {
  const inMemory = albumColorMemoryCache.get(cacheKey);
  if (inMemory) return inMemory;
  if (typeof window === 'undefined') return null;
  const fromStorage = window.localStorage.getItem(`${LOCAL_CACHE_PREFIX}${cacheKey}`);
  if (!fromStorage) return null;
  albumColorMemoryCache.set(cacheKey, fromStorage);
  return fromStorage;
}

function writeCachedAlbumColor(cacheKey: string, color: string): void {
  albumColorMemoryCache.set(cacheKey, color);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`${LOCAL_CACHE_PREFIX}${cacheKey}`, color);
  }
}

export async function extractDominantColor(imageUrl: string): Promise<string> {
  const cacheKey = getAlbumColorCacheKey(imageUrl);
  const cachedColor = readCachedAlbumColor(cacheKey);
  if (cachedColor) return cachedColor;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create a canvas and draw the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(DEFAULT_DOMINANT_COLOR);
          return;
        }
        
        // Set canvas size for performance (smaller = faster but less accurate)
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, size, size);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Sample pixels and build quantized histogram for deterministic output across OS.
        const step = 2;
        const buckets = new Map<string, ColorBucket>();
        const centerFocus = size / 2;
        const centerRadius = size * 0.3;
        const bucketSize = 16;
        
        for (let i = 0; i < data.length; i += step * 4) {
          const index = i / 4;
          const x = (index % size);
          const y = Math.floor(index / size);
          
          // Calculate distance from center
          const centerDist = Math.sqrt(
            Math.pow(x - centerFocus, 2) + Math.pow(y - centerFocus, 2)
          );
          
          // Weight pixels closer to center slightly more.
          const centerWeight = centerDist < centerRadius ? 1.6 : 1;
          
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          const brightness = (r + g + b) / 3;
          
          // Skip transparent, too dark, or too bright pixels
          if (a > 128 && brightness > 45 && brightness < 230) {
            const rQ = Math.floor(r / bucketSize);
            const gQ = Math.floor(g / bucketSize);
            const bQ = Math.floor(b / bucketSize);
            const key = `${rQ},${gQ},${bQ}`;
            const existing = buckets.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
            existing.count += centerWeight;
            existing.rSum += r * centerWeight;
            existing.gSum += g * centerWeight;
            existing.bSum += b * centerWeight;
            buckets.set(key, existing);
          }
        }
        
        // Find the dominant color
        const dominantColor = findDominantColor(buckets);
        writeCachedAlbumColor(cacheKey, dominantColor);
        resolve(dominantColor);
      } catch {
        resolve(DEFAULT_DOMINANT_COLOR);
      }
    };
    
    img.onerror = () => {
      resolve(DEFAULT_DOMINANT_COLOR);
    };
    
    img.src = imageUrl;
  });
}

/**
 * Find dominant color from quantized histogram.
 */
function findDominantColor(buckets: Map<string, ColorBucket>): string {
  if (buckets.size === 0) {
    return DEFAULT_DOMINANT_COLOR;
  }
  
  let best: (ColorBucket & { score: number }) | null = null;
  for (const bucket of buckets.values()) {
    const avgR = bucket.rSum / bucket.count;
    const avgG = bucket.gSum / bucket.count;
    const avgB = bucket.bSum / bucket.count;
    const max = Math.max(avgR, avgG, avgB);
    const min = Math.min(avgR, avgG, avgB);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const score = bucket.count * (1 + saturation * 0.35);
    if (!best || score > best.score) {
      best = { ...bucket, score };
    }
  }

  if (!best) return DEFAULT_DOMINANT_COLOR;
  return rgbToHex(
    Math.round(best.rSum / best.count),
    Math.round(best.gSum / best.count),
    Math.round(best.bSum / best.count)
  );
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Generate lighter shade of a color
 */
export function lightenColor(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lightenAmount = percent / 100;
  
  return rgbToHex(
    Math.round(r + (255 - r) * lightenAmount),
    Math.round(g + (255 - g) * lightenAmount),
    Math.round(b + (255 - b) * lightenAmount)
  );
}

/**
 * Generate darker shade of a color
 */
export function darkenColor(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const darkenAmount = percent / 100;
  
  return rgbToHex(
    Math.round(r * (1 - darkenAmount)),
    Math.round(g * (1 - darkenAmount)),
    Math.round(b * (1 - darkenAmount))
  );
}

/**
 * Convert hex to RGB
 */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ];
}

/**
 * Generate rgba from hex with opacity
 */
export function hexToRgba(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
}

/**
 * Shift the hue of a color by a certain angle
 */
export function shiftHue(hex: string, angle: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  
  // Shift hue
  let shiftedHue = (h + angle) % 360;
  if (shiftedHue < 0) shiftedHue += 360;
  
  // Convert back to RGB
  const [newR, newG, newB] = hslToRgb(shiftedHue, s, l);
  return rgbToHex(newR, newG, newB);
}

/**
 * Increase saturation of a color
 */
export function saturateColor(hex: string, percent: number): string {
  let [r, g, b] = hexToRgb(hex);
  
  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Increase saturation
  s = Math.min(1, s * (1 + percent / 100));
  
  // Convert HSL back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let newR, newG, newB;
  if (s === 0) {
    newR = newG = newB = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    newR = hue2rgb(p, q, h + 1/3);
    newG = hue2rgb(p, q, h);
    newB = hue2rgb(p, q, h - 1/3);
  }
  
  return rgbToHex(
    Math.round(newR * 255),
    Math.round(newG * 255),
    Math.round(newB * 255)
  );
}

