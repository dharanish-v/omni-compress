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
 * Internal engine — shared by both the v2.0 named exports and the archive/batch logic.
 */
export async function _compress(
  input: File | Blob,
  options: CompressorOptions,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new AbortError('Compression aborted');

  logger.info('Starting compression', { type: options.type, format: options.format });
  const route = Router.evaluate(options);
  logger.debug('Route evaluated', route);

  const fileSize = input.size;
  assertFileSizeWithinLimit(fileSize, route.env);

  const mimeType = getMimeType(options.type, options.format);

  if ('name' in input) {
    options.originalFileName = input.name;
    logger.debug(`Extracted original filename: ${options.originalFileName}`);
  }

  options.onProgress?.(0);

  if (route.env === 'node') {
    logger.info('Executing via Node.js native adapter');
    if (!processWithNode) {
      logger.debug('Dynamically loading Node child_process adapter');
      const adapter = await import('../adapters/node/childProcess.js');
      processWithNode = adapter.processWithNode;
    }
    const result = await processWithNode!(input, options, signal);
    logger.info('Node processing complete');
    options.onProgress?.(100);
    return result;
  } else {
    logger.info(`Executing via Browser Worker pool. Fast path: ${route.isFastPath}`);
    logger.debug('Converting File/Blob to ArrayBuffer');
    const buffer = await fileToArrayBuffer(input);

    logger.debug('Dispatching task to worker pool');
    const processedBuffer = await processWithBrowserWorker(buffer, options, route.isFastPath, signal);

    logger.info('Browser processing complete');
    options.onProgress?.(100);
    return arrayBufferToBlob(processedBuffer, mimeType);
  }
}
