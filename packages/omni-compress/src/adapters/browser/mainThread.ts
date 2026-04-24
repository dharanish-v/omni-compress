import {
  processImageFastPathToBlob,
  processAudioFastPath,
  processVideoFastPath,
} from './fastPath.js';
import { encodeAVIF } from './avifEncoder.js';
import { optimizePNG } from './pngOptimizer.js';
import type { CompressorOptions } from '../../core/router.js';

/**
 * Executes compression tasks on the main thread for lower latency.
 * Only intended for Fast Path operations on small files.
 *
 * `input` is `Blob | ArrayBuffer`:
 * - For the image fast path, the caller passes the original Blob directly and this
 *   function returns a Blob (zero-copy: no Blob→ArrayBuffer→Blob round-trips).
 * - For AVIF/audio/video the ArrayBuffer is materialised internally as required.
 */
export async function processOnMainThread(
  input: ArrayBuffer | Blob,
  options: CompressorOptions,
  isFastPath: boolean,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer | Blob> {
  // 1. Standalone AVIF Path — always needs ArrayBuffer
  if (options.format === 'avif') {
    const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    return await encodeAVIF(buffer, options, onProgress);
  }

  // 2. Image Fast Path (OffscreenCanvas) — returns Blob directly (zero-copy, issue #62)
  if (options.type === 'image' && isFastPath) {
    onProgress?.(50);
    const blob = await processImageFastPathToBlob(input, options);
    // PNG: run through OxiPNG for lossless size reduction (20–35% smaller).
    // Only on main thread — oxipng MT mode creates sub-workers whose filenames
    // Vite hashes, causing 404 crashes in the image worker.
    if (options.format === 'png') {
      const pngBuf = await blob.arrayBuffer();
      const optimized = await optimizePNG(pngBuf);
      return new Blob([optimized], { type: 'image/png' });
    }
    return blob;
  }

  // For audio/video, ArrayBuffer is required by the codec APIs
  const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();

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

  throw new Error(
    `MainThread: Route not eligible for main-thread execution (type=${options.type}, format=${options.format})`,
  );
}
