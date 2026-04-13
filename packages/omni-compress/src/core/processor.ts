import { Router, type CompressorOptions } from './router.js';
import {
  fileToArrayBuffer,
  arrayBufferToBlob,
  getMimeType,
  assertFileSizeWithinLimit,
} from './utils.js';
import { processWithBrowserWorker } from '../adapters/browser/workerPool.js';
import { logger } from './logger.js';
import { AbortError } from './errors.js';
import type { processWithNode as ProcessWithNodeFn } from '../adapters/node/childProcess.js';

// Dynamically imported to avoid breaking browser environments
let processWithNode: typeof ProcessWithNodeFn | null = null;

/**
 * Resolves the target format when set to 'auto'.
 * Default logic:
 * - Images: WebP (excellent compatibility/compression)
 * - Audio: MP3 (universal compatibility)
 */
function resolveAutoFormat(input: File | Blob, options: CompressorOptions): string {
  if (options.format !== 'auto') return options.format;

  if (options.type === 'image') {
    // If it's already WebP or AVIF, keep it or go to WebP
    if (input.type === 'image/avif') return 'avif';
    return 'webp';
  } else if (options.type === 'audio') {
    // For audio, MP3 is the safest universal default
    if (input.type === 'audio/opus' || input.type === 'audio/ogg') return 'opus';
    return 'mp3';
  } else {
    // For video, MP4 is the safest universal default
    return 'mp4';
  }
}

/**
 * Internal engine — shared by both the v2.0 named exports and the archive/batch logic.
 */
export async function _compress(
  input: File | Blob,
  options: CompressorOptions,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new AbortError('Compression aborted');

  // Resolve 'auto' format before routing
  const originalFormat = options.format;
  options.format = resolveAutoFormat(input, options);

  if (originalFormat === 'auto') {
    logger.info(`Auto-format resolved: ${options.format}`, { type: options.type });
  }
  logger.info('Starting compression', { type: options.type, format: options.format });
  const route = Router.evaluate(options, input.size);
  logger.debug('Route evaluated', route);

  const fileSize = input.size;
  assertFileSizeWithinLimit(fileSize, route.env);

  const mimeType = getMimeType(options.type, options.format);

  if ('name' in input) {
    options.originalFileName = input.name;
    logger.debug(`Extracted original filename: ${options.originalFileName}`);
  }

  options.onProgress?.(0);

  let processedBlob: Blob;

  if (route.env === 'node') {
    logger.info('Executing via Node.js native adapter');
    if (!processWithNode) {
      logger.debug('Dynamically loading Node child_process adapter');
      const adapter = await import('../adapters/node/childProcess.js');
      processWithNode = adapter.processWithNode;
    }
    processedBlob = await processWithNode!(input, options, signal);
  } else {
    if (!route.shouldUseWorker) {
      try {
        logger.info('Executing via Main Thread (High-speed path)');
        const adapter = await import('../adapters/browser/mainThread.js');

        // Zero-copy optimisation (#62): for image fast path, pass the original Blob
        // directly — processOnMainThread returns a Blob (no Blob→ArrayBuffer→Blob trips).
        // For AVIF, audio, and video the ArrayBuffer is materialised inside mainThread.ts.
        const mainThreadInput =
          route.isFastPath && options.type === 'image'
            ? input // original Blob — no conversion
            : await fileToArrayBuffer(input); // materialise only when needed

        const mainThreadResult = await adapter.processOnMainThread(
          mainThreadInput,
          options,
          route.isFastPath,
          options.onProgress,
        );

        // Image fast path returns Blob directly; all other paths return ArrayBuffer.
        processedBlob =
          mainThreadResult instanceof Blob
            ? mainThreadResult
            : arrayBufferToBlob(mainThreadResult, mimeType);
      } catch (mainThreadError: any) {
        logger.warn(
          `Main thread execution failed: ${mainThreadError.message}. Falling back to Worker.`,
        );
        processedBlob = arrayBufferToBlob(
          await processWithBrowserWorker(input, options, route.isFastPath, signal),
          mimeType,
        );
      }
    } else {
      // 2. Background Worker Path
      // Performance optimization: pass the raw File/Blob to the worker and let it read it
      // off the main thread. postMessage(blob) is instantaneous.
      logger.info(`Executing via Browser Worker pool. Fast path: ${route.isFastPath}`);
      processedBlob = arrayBufferToBlob(
        await processWithBrowserWorker(input, options, route.isFastPath, signal),
        mimeType,
      );
    }
  }

  logger.info('Processing complete');
  options.onProgress?.(100);

  // Handle strict mode: if compressed is larger or equal, return original
  if (options.strict && processedBlob.size >= input.size) {
    logger.info('Strict mode: Compressed size exceeds original. Returning original blob.', {
      compressed: processedBlob.size,
      original: input.size,
    });
    return input;
  }

  return processedBlob;
}
