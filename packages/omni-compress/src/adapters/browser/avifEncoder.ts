import type { CompressorOptions } from "../../core/router.js";
import { EncoderError } from "../../core/errors.js";
import { SAFE_SIZE_LIMITS } from "../../core/utils.js";
import { logger } from "../../core/logger.js";

/**
 * Encodes an image to AVIF using @jsquash/avif (libaom-av1 compiled to Wasm).
 *
 * This bypasses FFmpeg entirely — @jsquash/avif is a standalone 1.1 MB (gzipped)
 * encoder derived from Google's Squoosh project. It auto-selects multi-threaded
 * Wasm when SharedArrayBuffer is available, single-threaded otherwise.
 *
 * Input: ArrayBuffer of any image format decodable by createImageBitmap()
 * Output: ArrayBuffer of AVIF data
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
  const bitmap = await createImageBitmap(blob);

  let width = bitmap.width;
  let height = bitmap.height;

  if (options.maxWidth || options.maxHeight) {
    const ratio = bitmap.width / bitmap.height;
    if (options.maxWidth && width > options.maxWidth) {
      width = options.maxWidth;
      height = width / ratio;
    }
    if (options.maxHeight && height > options.maxHeight) {
      height = options.maxHeight;
      width = height * ratio;
    }
  }

  width = Math.floor(width);
  height = Math.floor(height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new EncoderError("Failed to get 2d context for OffscreenCanvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  bitmap.close(); // Release decoded image memory

  onProgress?.(30);

  // 2. Lazy-load the @jsquash/avif encoder (loads ~1.1 MB gzipped Wasm on first call)
  logger.debug("Loading @jsquash/avif encoder...");
  const { encode } = await import("@jsquash/avif");

  onProgress?.(50);

  // 3. Encode to AVIF
  // @jsquash/avif quality is 0-100 (integer), our API uses 0.0-1.0
  const quality =
    options.quality !== undefined ? Math.round(options.quality * 100) : 50;

  logger.debug(`Encoding AVIF: ${width}x${height}, quality=${quality}`);

  try {
    const avifBuffer = await encode(imageData, {
      quality,
      speed: 6, // 0-10, higher = faster. 6 is a good balance for Wasm.
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
