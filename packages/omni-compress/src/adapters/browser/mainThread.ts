import { processImageFastPath, processAudioFastPath, processVideoFastPath } from './fastPath.js';
import { encodeAVIF } from './avifEncoder.js';
import type { CompressorOptions } from '../../core/router.js';

/**
 * Executes compression tasks on the main thread for lower latency.
 * Only intended for Fast Path operations on small files.
 */
export async function processOnMainThread(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  // 1. Standalone AVIF Path
  if (options.format === 'avif') {
    return await encodeAVIF(buffer, options, onProgress);
  }

  // 2. Image Fast Path (OffscreenCanvas)
  if (options.type === 'image' && isFastPath) {
    onProgress?.(50);
    return await processImageFastPath(buffer, options);
  }

  // 3. Audio Fast Path (WebCodecs)
  if (options.type === 'audio' && isFastPath) {
    onProgress?.(50);
    return await processAudioFastPath(buffer, options);
  }

  // 4. Video Fast Path (WebCodecs foundation)
  if (options.type === 'video' && isFastPath) {
    onProgress?.(50);
    return await processVideoFastPath(buffer, options);
  }

  throw new Error(`MainThread: Route not eligible for main-thread execution (type=${options.type}, format=${options.format})`);
}
