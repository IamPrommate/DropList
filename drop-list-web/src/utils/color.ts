/**
 * Extract the dominant color from an image
 * @param imageUrl - URL of the image
 * @returns Promise with the dominant color as hex string
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create a canvas and draw the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
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
        
        // Sample pixels with focus on center area
        const step = 2;
        const colors: number[][] = [];
        const centerFocus = size / 2;
        const centerRadius = size * 0.3; // Focus on center 30% of image
        
        for (let i = 0; i < data.length; i += step * 4) {
          const index = i / 4;
          const x = (index % size);
          const y = Math.floor(index / size);
          
          // Calculate distance from center
          const centerDist = Math.sqrt(
            Math.pow(x - centerFocus, 2) + Math.pow(y - centerFocus, 2)
          );
          
          // Weight pixels closer to center more heavily
          const centerWeight = centerDist < centerRadius ? 2 : 1;
          
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          const brightness = (r + g + b) / 3;
          
          // Skip transparent, too dark, or too bright pixels
          if (a > 128 && brightness > 60 && brightness < 220) {
            // Add color multiple times based on center weight
            for (let w = 0; w < centerWeight; w++) {
              colors.push([r, g, b]);
            }
          }
        }
        
        // Find the dominant color
        const dominantColor = findDominantColor(colors);
        
        resolve(dominantColor);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Find the dominant color from an array of RGB values
 */
function findDominantColor(colors: number[][]): string {
  if (colors.length === 0) {
    return '#a855f7'; // Default purple
  }
  
  // Use median approach to avoid outliers
  // Sort colors by their "vibrancy" score and pick the median
  const scoredColors = colors.map(([r, g, b]) => {
    const saturation = getSaturation(r, g, b);
    const brightness = (r + g + b) / 3;
    
    // Penalize yellow-dominated colors (high G, high R+G+B)
    const yellowScore = (g + b) / 2;
    const vibrancy = saturation * brightness * (1 - yellowScore / 255 * 0.3);
    
    return { r, g, b, vibrancy };
  });
  
  // Sort by vibrancy and get median
  scoredColors.sort((a, b) => b.vibrancy - a.vibrancy);
  const median = scoredColors[Math.floor(scoredColors.length * 0.3)]; // Get 30th percentile (more vibrant)
  
  return rgbToHex(median.r, median.g, median.b);
}

/**
 * Calculate saturation of a color
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  if (max === 0) return 0;
  return delta / max;
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
  let [h, s, l] = rgbToHsl(r, g, b);
  
  // Shift hue
  h = (h + angle) % 360;
  if (h < 0) h += 360;
  
  // Convert back to RGB
  const [newR, newG, newB] = hslToRgb(h, s, l);
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

