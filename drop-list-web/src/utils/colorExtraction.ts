/**
 * Extract dominant color from an image
 * @param imageUrl - URL of the image to extract color from
 * @returns Promise that resolves to the dominant color in hex format
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Set canvas size to a smaller size for performance
        const size = 150;
        canvas.width = size;
        canvas.height = size;
        
        // Draw image to canvas
        ctx.drawImage(img, 0, 0, size, size);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Use a more sophisticated color extraction that favors vibrant colors
        const colorMap = new Map<string, number>();
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          // Calculate saturation and brightness
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = (r + g + b) / 3;
          
          // Only consider vibrant colors (high saturation) and avoid very dark/light
          if (saturation < 0.3 || brightness < 40 || brightness > 200) continue;
          
          // Boost the weight for more saturated colors
          const saturationWeight = Math.pow(saturation, 2);
          
          // Quantize colors to reduce noise
          const quantizedR = Math.round(r / 15) * 15;
          const quantizedG = Math.round(g / 15) * 15;
          const quantizedB = Math.round(b / 15) * 15;
          
          const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
          const currentWeight = colorMap.get(colorKey) || 0;
          colorMap.set(colorKey, currentWeight + saturationWeight);
        }
        
        // Find the most weighted color (most saturated and frequent)
        let maxWeight = 0;
        let dominantColor = '';
        
        for (const [color, weight] of colorMap) {
          if (weight > maxWeight) {
            maxWeight = weight;
            dominantColor = color;
          }
        }
        
        if (dominantColor) {
          const [r, g, b] = dominantColor.split(',').map(Number);
          
          // Enhance contrast and slightly darken the color
          const contrastFactor = 1.4; // Increase contrast
          const darkenFactor = 0.85; // Slightly darken the color
          
          // Apply contrast enhancement
          let enhancedR = (r - 128) * contrastFactor + 128;
          let enhancedG = (g - 128) * contrastFactor + 128;
          let enhancedB = (b - 128) * contrastFactor + 128;
          
          // Apply slight darkening
          enhancedR = Math.max(0, Math.min(255, enhancedR * darkenFactor));
          enhancedG = Math.max(0, Math.min(255, enhancedG * darkenFactor));
          enhancedB = Math.max(0, Math.min(255, enhancedB * darkenFactor));
          
          const hex = `#${Math.round(enhancedR).toString(16).padStart(2, '0')}${Math.round(enhancedG).toString(16).padStart(2, '0')}${Math.round(enhancedB).toString(16).padStart(2, '0')}`;
          resolve(hex);
        } else {
          // Fallback to average color if no dominant color found
          let r = 0, g = 0, b = 0;
          let pixelCount = 0;
          
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 128) { // Skip transparent pixels
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              pixelCount++;
            }
          }
          
          if (pixelCount > 0) {
            r = Math.round(r / pixelCount);
            g = Math.round(g / pixelCount);
            b = Math.round(b / pixelCount);
            
            // Apply contrast enhancement and slight darkening
            const contrastFactor = 1.4;
            const darkenFactor = 0.85;
            
            let enhancedR = (r - 128) * contrastFactor + 128;
            let enhancedG = (g - 128) * contrastFactor + 128;
            let enhancedB = (b - 128) * contrastFactor + 128;
            
            enhancedR = Math.max(0, Math.min(255, enhancedR * darkenFactor));
            enhancedG = Math.max(0, Math.min(255, enhancedG * darkenFactor));
            enhancedB = Math.max(0, Math.min(255, enhancedB * darkenFactor));
            
            r = Math.round(enhancedR);
            g = Math.round(enhancedG);
            b = Math.round(enhancedB);
          }
          
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          resolve(hex);
        }
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
 * Generate a gradient background from a primary color
 * @param primaryColor - Primary color in hex format
 * @returns CSS gradient string
 */
export function generateGradientFromColor(primaryColor: string): string {
  return `linear-gradient(to bottom, ${primaryColor} 0%, #1f1f2e 30%)`;
}

/**
 * Generate a sidebar gradient from a primary color
 * @param primaryColor - Primary color in hex format
 * @returns CSS gradient string
 */
export function generateSidebarGradientFromColor(primaryColor: string): string {
  // Convert hex to RGB
  const hex = primaryColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Create darker variations for sidebar
  const dark1 = `rgb(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)})`;
  const dark2 = `rgb(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)})`;
  
  return `linear-gradient(180deg, ${dark1} 0%, ${dark2} 100%)`;
}

/**
 * Set CSS custom properties for inherited colors
 * @param primaryColor - Primary color in hex format
 */
export function setInheritedColors(primaryColor: string): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    
    // Convert hex to RGB
    const hex = primaryColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Set CSS custom properties
    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--primary-color-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--primary-color-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--primary-color-alpha-30', `rgba(${r}, ${g}, ${b}, 0.3)`);
    root.style.setProperty('--primary-color-alpha-40', `rgba(${r}, ${g}, ${b}, 0.4)`);
    root.style.setProperty('--primary-color-alpha-60', `rgba(${r}, ${g}, ${b}, 0.6)`);
    root.style.setProperty('--primary-color-alpha-70', `rgba(${r}, ${g}, ${b}, 0.7)`);
    root.style.setProperty('--primary-color-alpha-80', `rgba(${r}, ${g}, ${b}, 0.8)`);
  }
}
