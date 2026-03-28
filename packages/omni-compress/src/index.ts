import {
  Router,
  type CompressorOptions,
  type CompressResult,
  type ImageOptions,
  type AudioOptions,
} from './core/router.js';
import {
  fileToArrayBuffer,
  arrayBufferToBlob,
  getMimeType,
  assertFileSizeWithinLimit,
} from './core/utils.js';
import { processWithBrowserWorker } from './adapters/browser/workerPool.js';
import { logger } from './core/logger.js';
import { InvalidOptionsError, FormatNotSupportedError, AbortError } from './core/errors.js';
import type { processWithNode as ProcessWithNodeFn } from './adapters/node/childProcess.js';

// Dynamically imported to avoid breaking browser environments
let processWithNode: typeof ProcessWithNodeFn | null = null;

const VALID_IMAGE_FORMATS = new Set(['webp', 'avif', 'jpeg', 'jpg', 'png']);
const VALID_AUDIO_FORMATS = new Set(['opus', 'mp3', 'flac', 'wav', 'aac', 'ogg']);

// ---------------------------------------------------------------------------
// Internal engine — shared by both the v2.0 named exports and the deprecated shim
// ---------------------------------------------------------------------------

async function _compress(
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
      const adapter = await import('./adapters/node/childProcess.js');
      processWithNode = adapter.processWithNode;
    }
    const result = await processWithNode(input, options, signal);
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

// ---------------------------------------------------------------------------
// v2.0 named function exports (#33)
// ---------------------------------------------------------------------------

/**
 * Compresses an image to the specified format.
 *
 * Automatically selects the fastest available engine:
 * - **Fast path**: OffscreenCanvas (JPEG/PNG/WebP — zero Wasm, hardware-accelerated)
 * - **Heavy path**: FFmpeg Wasm (AVIF and all other formats, or fallback)
 * - **Node**: native `ffmpeg` binary via child_process
 *
 * @example
 * ```ts
 * const { blob, ratio } = await compressImage(file, { format: 'webp', quality: 0.8 });
 * console.log(`Compressed to ${(ratio * 100).toFixed(0)}% of original size`);
 * ```
 */
export async function compressImage(
  input: File | Blob,
  options: ImageOptions,
): Promise<CompressResult> {
  if (!options || typeof options !== 'object') {
    throw new InvalidOptionsError('Options object is required');
  }

  const format = options.format?.toLowerCase() as string | undefined;
  if (!format || !VALID_IMAGE_FORMATS.has(format)) {
    throw new FormatNotSupportedError(
      `"${options.format}" is not a supported image format. Supported: webp, avif, jpeg, png`,
      options.format,
    );
  }

  if (options.quality !== undefined && (options.quality < 0 || options.quality > 1)) {
    throw new InvalidOptionsError(
      `Quality must be between 0.0 and 1.0. Received: ${options.quality}`,
    );
  }

  const originalSize = input.size;

  const compressorOptions: CompressorOptions = {
    type: 'image',
    format: options.format,
    quality: options.quality,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    preserveMetadata: options.preserveMetadata,
    onProgress: options.onProgress,
  };

  const blob = await _compress(input, compressorOptions, options.signal);

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    ratio: originalSize > 0 ? blob.size / originalSize : 1,
    format: options.format,
  };
}

/**
 * Compresses an audio file to the specified format.
 *
 * Routes through FFmpeg Wasm in the browser (or native FFmpeg in Node).
 *
 * @example
 * ```ts
 * const { blob, ratio } = await compressAudio(file, { format: 'opus', bitrate: '96k' });
 * ```
 */
export async function compressAudio(
  input: File | Blob,
  options: AudioOptions,
): Promise<CompressResult> {
  if (!options || typeof options !== 'object') {
    throw new InvalidOptionsError('Options object is required');
  }

  const format = options.format?.toLowerCase() as string | undefined;
  if (!format || !VALID_AUDIO_FORMATS.has(format)) {
    throw new FormatNotSupportedError(
      `"${options.format}" is not a supported audio format. Supported: opus, mp3, flac, wav, aac`,
      options.format,
    );
  }

  const originalSize = input.size;

  const compressorOptions: CompressorOptions = {
    type: 'audio',
    format: options.format,
    bitrate: options.bitrate,
    channels: options.channels,
    sampleRate: options.sampleRate,
    preserveMetadata: options.preserveMetadata,
    onProgress: options.onProgress,
  };

  const blob = await _compress(input, compressorOptions, options.signal);

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    ratio: originalSize > 0 ? blob.size / originalSize : 1,
    format: options.format,
  };
}

// ---------------------------------------------------------------------------
// v1.x legacy class — kept as @deprecated shim until v3.0
// ---------------------------------------------------------------------------

function validateLegacyOptions(options: CompressorOptions): void {
  if (!options || typeof options !== 'object') {
    throw new InvalidOptionsError('Options object is required');
  }
  if (!new Set(['image', 'audio']).has(options.type)) {
    throw new InvalidOptionsError(`Invalid type "${options.type}". Must be "image" or "audio".`);
  }
  if (!options.format || typeof options.format !== 'string') {
    throw new InvalidOptionsError('A target format string is required');
  }
  const knownFormats = options.type === 'image' ? VALID_IMAGE_FORMATS : VALID_AUDIO_FORMATS;
  if (!knownFormats.has(options.format.toLowerCase())) {
    logger.warn(`Format "${options.format}" is not a recognized ${options.type} format. Proceeding via Heavy Path.`);
  }
  if (options.quality !== undefined && (options.quality < 0 || options.quality > 1)) {
    throw new InvalidOptionsError(`Quality must be between 0.0 and 1.0. Received: ${options.quality}`);
  }
  if (options.maxSizeMB !== undefined && (typeof options.maxSizeMB !== 'number' || options.maxSizeMB <= 0)) {
    throw new InvalidOptionsError(`maxSizeMB must be a positive number. Received: ${options.maxSizeMB}`);
  }
}

export class OmniCompressor {
  /**
   * Processes a media file (image or audio) using the optimal available engine.
   *
   * @deprecated Use {@link compressImage} or {@link compressAudio} instead.
   * `OmniCompressor.process()` will be removed in v3.0. The new functions return
   * a {@link CompressResult} with size metadata instead of a raw Blob.
   *
   * @example
   * ```typescript
   * // v1.x (deprecated)
   * const blob = await OmniCompressor.process(file, { type: 'image', format: 'webp' });
   *
   * // v2.0 (preferred)
   * const { blob, ratio } = await compressImage(file, { format: 'webp' });
   * ```
   */
  static async process(file: File | Blob, options: CompressorOptions): Promise<Blob> {
    validateLegacyOptions(options);
    return _compress(file, options);
  }

  /**
   * Configure the global logging level.
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

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './core/router.js';
export * from './core/utils.js';
export * from './core/logger.js';
export * from './core/errors.js';
export { WorkerConfig } from './adapters/browser/workerPool.js';
export { archive, archiveStream } from './archive.js';
