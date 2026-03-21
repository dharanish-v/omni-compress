import { Router, CompressorOptions } from './core/router.js';
import { fileToArrayBuffer, arrayBufferToBlob, getMimeType } from './core/utils.js';
import { processWithBrowserWorker } from './adapters/browser/workerPool.js';
import { logger } from './core/logger.js';
import type { processWithNode as ProcessWithNodeFn } from './adapters/node/childProcess.js';

// Dynamically imported to avoid breaking browser environments
let processWithNode: typeof ProcessWithNodeFn | null = null;

const VALID_TYPES = new Set(['image', 'audio']);
const VALID_IMAGE_FORMATS = new Set(['webp', 'avif', 'jpeg', 'jpg', 'png']);
const VALID_AUDIO_FORMATS = new Set(['opus', 'mp3', 'flac', 'wav', 'aac', 'ogg']);

function validateOptions(options: CompressorOptions): void {
  if (!options || typeof options !== 'object') {
    throw new Error('Options object is required.');
  }
  if (!VALID_TYPES.has(options.type)) {
    throw new Error(`Invalid type "${options.type}". Must be "image" or "audio".`);
  }
  if (!options.format || typeof options.format !== 'string') {
    throw new Error('A target format string is required.');
  }
  const knownFormats = options.type === 'image' ? VALID_IMAGE_FORMATS : VALID_AUDIO_FORMATS;
  if (!knownFormats.has(options.format.toLowerCase())) {
    logger.warn(`Format "${options.format}" is not a recognized ${options.type} format. Proceeding via Heavy Path.`);
  }
  if (options.quality !== undefined && (options.quality < 0 || options.quality > 1)) {
    throw new Error(`Quality must be between 0.0 and 1.0. Received: ${options.quality}`);
  }
  if (options.maxSizeMB !== undefined && (typeof options.maxSizeMB !== 'number' || options.maxSizeMB <= 0)) {
    throw new Error(`maxSizeMB must be a positive number. Received: ${options.maxSizeMB}`);
  }
}

export class OmniCompressor {
  /**
   * Processes a media file (Image or Audio) using the optimal available engine.
   *
   * Automatically selects the best processing path:
   * - **Fast Path**: Native OffscreenCanvas/WebCodecs (0 KB Wasm) for standard web formats
   * - **Heavy Path**: FFmpeg Wasm for obscure/complex formats
   * - **Node Adapter**: Native OS ffmpeg binary via child_process
   *
   * @param file - The input File or Blob to process.
   * @param options - Configuration for compression (type, format, quality, etc.).
   * @returns A Promise resolving to the compressed Blob.
   * @throws {Error} If options are invalid or processing fails.
   *
   * @example
   * ```typescript
   * const compressed = await OmniCompressor.process(file, {
   *   type: 'image',
   *   format: 'webp',
   *   quality: 0.8,
   *   onProgress: (p) => console.log(`${p}%`),
   * });
   * ```
   */
  static async process(file: File | Blob, options: CompressorOptions): Promise<Blob> {
    validateOptions(options);
    logger.info('Starting compression process', { type: options.type, format: options.format });
    const route = Router.evaluate(options);
    logger.debug('Route evaluated', route);
    const mimeType = getMimeType(options.type, options.format);
    
    // Set the original filename if it's a File object, to help FFmpeg probe formats correctly
    if ('name' in file) {
      options.originalFileName = (file as File).name;
      logger.debug(`Extracted original filename: ${options.originalFileName}`);
    }

    options.onProgress?.(0);

    if (route.env === 'node') {
      logger.info('Executing via Node.js native adapter');
      // PHASE 5 Implementation
      if (!processWithNode) {
        logger.debug('Dynamically loading Node child_process adapter');
        // Dynamically import the Node adapter only when in Node environment
        // This ensures Webpack/Vite don't crash trying to polyfill 'node:child_process'
        const adapter = await import('./adapters/node/childProcess.js');
        processWithNode = adapter.processWithNode;
      }
      const result = await processWithNode(file, options);
      logger.info('Node processing complete');
      options.onProgress?.(100);
      return result;
    } else {
      logger.info(`Executing via Browser Worker pool. Fast path: ${route.isFastPath}`);
      // Browser Environment
      logger.debug('Converting File/Blob to ArrayBuffer');
      const buffer = await fileToArrayBuffer(file);
      
      // Zero-copy transfer to worker and back
      logger.debug('Dispatching task to worker pool');
      const processedBuffer = await processWithBrowserWorker(buffer, options, route.isFastPath);
      
      logger.info('Browser processing complete');
      options.onProgress?.(100);
      return arrayBufferToBlob(processedBuffer, mimeType);
    }
  }

  /**
   * Configure the global logging level.
   *
   * @param level - The minimum log level to output.
   *
   * @example
   * ```typescript
   * OmniCompressor.setLogLevel('debug'); // Show all logs
   * OmniCompressor.setLogLevel('error'); // Only show errors
   * ```
   */
  static setLogLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    logger.setLevel(level);
  }
}

export * from './core/router.js';
export * from './core/utils.js';
export * from './core/logger.js';
export { WorkerConfig } from './adapters/browser/workerPool.js';

