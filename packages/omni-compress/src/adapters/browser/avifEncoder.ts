import type { CompressorOptions } from "../../core/router.js";
import { EncoderError } from "../../core/errors.js";
import { SAFE_SIZE_LIMITS } from "../../core/utils.js";
import { logger } from "../../core/logger.js";

/**
 * Encodes an image to AVIF format using @jsquash/avif.
 * Optimized to resize during decoding when possible.
 */
export async function encodeAVIF(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe limit (250 MB).`,
    );
  }

  // 1. Decode input image to raw pixels via createImageBitmap + OffscreenCanvas
  const blob = new Blob([buffer]);
  
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  // Pre-calculate dimensions to leverage createImageBitmap's native resizer
  if (options.maxWidth || options.maxHeight) {
    const tempBitmap = await createImageBitmap(blob);
    const ratio = tempBitmap.width / tempBitmap.height;
    targetWidth = tempBitmap.width;
    targetHeight = tempBitmap.height;
    tempBitmap.close();

    if (options.maxWidth && targetWidth > options.maxWidth) {
      targetWidth = options.maxWidth;
      targetHeight = targetWidth / ratio;
    }
    if (options.maxHeight && targetHeight > (options.maxHeight || 0)) {
      targetHeight = options.maxHeight;
      targetWidth = targetHeight * ratio;
    }

    targetWidth = Math.floor(targetWidth!);
    targetHeight = Math.floor(targetHeight!);
  }

  const bitmap = await createImageBitmap(blob, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  });

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new EncoderError("Failed to get 2d context for OffscreenCanvas");
  
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close(); // Release decoded image memory

  onProgress?.(30);

  // 2. Load encoder
  const { encode } = await import("@jsquash/avif");

  onProgress?.(50);

  // 3. Encode to AVIF
  // @jsquash/avif quality is 0-100 (integer), our API uses 0.0-1.0
  const quality =
    options.quality !== undefined ? Math.round(options.quality * 100) : 50;

  logger.debug(`Encoding AVIF: ${imageData.width}x${imageData.height}, quality=${quality}`);

  try {
    const avifBuffer = await encode(imageData, {
      quality,
      speed: 8, // Increased from 6 to 8 for faster browser encoding
    });

    onProgress?.(100);
    logger.debug(
      `AVIF encoding complete: ${(avifBuffer.byteLength / 1024).toFixed(1)} KB`,
    );

    return avifBuffer;
  } catch (err) {
    throw new EncoderError("AVIF encoding failed", err);
  }
}
