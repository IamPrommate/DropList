/** Max file size before decode (browser upload guard). */
export const COVER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Output square size (px) after center crop. */
export const COVER_OUTPUT_SIZE = 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Center-crop image to a square and export as JPEG.
 * No interactive crop UI — always uses the middle square of the source.
 */
export async function squareCenterCropToJpegBlob(
  file: File,
  outputSize: number = COVER_OUTPUT_SIZE,
  quality = 0.92
): Promise<Blob> {
  if (file.size > COVER_UPLOAD_MAX_BYTES) {
    throw new Error(`Image must be at most ${COVER_UPLOAD_MAX_BYTES / (1024 * 1024)} MB`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Please choose a JPEG, PNG, WebP, or GIF image');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    if (w < 2 || h < 2) {
      throw new Error('Image is too small');
    }

    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not process image');
    }

    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outputSize, outputSize);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not encode image'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    });
  } finally {
    bitmap.close();
  }
}
