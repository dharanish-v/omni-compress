import {
  type CompressorOptions,
  type CompressResult,
  type ImageOptions,
  type AudioOptions,
  type VideoOptions,
} from './core/router.js';
import { _compress } from './core/processor.js';
import { logger } from './core/logger.js';
import { InvalidOptionsError, FormatNotSupportedError } from './core/errors.js';

const VALID_IMAGE_FORMATS = new Set(['webp', 'avif', 'jpeg', 'jpg', 'png', 'auto']);
const VALID_AUDIO_FORMATS = new Set(['opus', 'mp3', 'flac', 'wav', 'aac', 'ogg', 'auto']);
const VALID_VIDEO_FORMATS = new Set(['mp4', 'webm', 'auto']);

// ---------------------------------------------------------------------------
// Global defaults (Gap #11) — merged into every compressImage() call
// ---------------------------------------------------------------------------
let _imageDefaults: Partial<ImageOptions> = {};

/**
 * Set module-level default options applied to every `compressImage()` call.
 * Per-call options override these defaults.
 *
 * @example
 * ```ts
 * setDefaults({ quality: 0.7, maxWidth: 1920 });
 * ```
 */
export function setDefaults(options: Partial<ImageOptions>): void {
  _imageDefaults = { ..._imageDefaults, ...options };
}

/**
 * Reset all module-level defaults set via `setDefaults()`.
 */
export function resetDefaults(): void {
  _imageDefaults = {};
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

  // Gap #11: merge module-level defaults (per-call options win)
  const opts: ImageOptions = { ..._imageDefaults, ...options };

  const rawFormat = (opts.format || 'auto').toLowerCase();
  if (!VALID_IMAGE_FORMATS.has(rawFormat)) {
    throw new FormatNotSupportedError(
      `"${opts.format}" is not a supported image format. Supported: webp, avif, jpeg, png`,
      opts.format as string,
    );
  }

  if (opts.quality !== undefined && (opts.quality < 0 || opts.quality > 1)) {
    throw new InvalidOptionsError(`Quality must be between 0.0 and 1.0. Received: ${opts.quality}`);
  }

  // Gap #4-5: convertTypes / convertSize
  // If the input's MIME type is listed in convertTypes AND the file is below
  // convertSize, lock the format to the input's own format (no conversion).
  const inputMime = (input instanceof Blob ? input.type : '') || '';
  const convertTypesArr: string[] = opts.convertTypes
    ? Array.isArray(opts.convertTypes)
      ? opts.convertTypes
      : [opts.convertTypes]
    : [];
  const convertSize = opts.convertSize ?? 5 * 1024 * 1024; // 5 MB default

  let format = rawFormat;
  if (
    convertTypesArr.length > 0 &&
    convertTypesArr.includes(inputMime) &&
    input.size < convertSize
  ) {
    // File is below the conversion threshold — keep original format
    const inferredFormat = inputMime.split('/')[1] || rawFormat;
    format = inferredFormat === 'jpeg' ? 'jpeg' : inferredFormat;
    if (!VALID_IMAGE_FORMATS.has(format)) format = rawFormat;
  }

  const originalSize = input.size;

  const compressorOptions: CompressorOptions = {
    type: 'image',
    format: format as any,
    quality: opts.quality,
    maxWidth: opts.maxWidth,
    maxHeight: opts.maxHeight,
    minWidth: opts.minWidth,
    minHeight: opts.minHeight,
    width: opts.width,
    height: opts.height,
    resize: opts.resize,
    preserveMetadata: opts.preserveMetadata,
    onProgress: opts.onProgress,
    strict: opts.strict,
    checkOrientation: opts.checkOrientation,
    retainExif: opts.retainExif,
    beforeDraw: opts.beforeDraw,
    drew: opts.drew,
  };

  const blob = await _compress(input, compressorOptions, opts.signal);

  // Gap #10: build File with corrected extension
  let file: File | null = null;
  if (input instanceof File) {
    const ext = compressorOptions.format === 'jpeg' ? 'jpg' : compressorOptions.format;
    const baseName = input.name.replace(/\.[^.]+$/, '');
    file = new File([blob], `${baseName}.${ext}`, { type: blob.type });
  }

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    ratio: originalSize > 0 ? blob.size / originalSize : 1,
    format: compressorOptions.format,
    file,
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

  const format = (options.format || 'auto').toLowerCase();
  if (!VALID_AUDIO_FORMATS.has(format)) {
    throw new FormatNotSupportedError(
      `"${options.format}" is not a supported audio format. Supported: opus, mp3, flac, wav, aac`,
      options.format as string,
    );
  }

  const originalSize = input.size;

  const compressorOptions: CompressorOptions = {
    type: 'audio',
    format: format as any,
    bitrate: options.bitrate,
    channels: options.channels,
    sampleRate: options.sampleRate,
    preserveMetadata: options.preserveMetadata,
    onProgress: options.onProgress,
    strict: options.strict,
  };

  const blob = await _compress(input, compressorOptions, options.signal);

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    ratio: originalSize > 0 ? blob.size / originalSize : 1,
    format: compressorOptions.format,
    file: null,
  };
}

/**
 * Compresses a video file to the specified format.
 *
 * Automatically selects the fastest available engine:
 * - **Fast path**: WebCodecs (H.264/AV1 — browser hardware-accelerated)
 * - **Heavy path**: FFmpeg Wasm (fallback)
 * - **Node**: native `ffmpeg` binary via child_process
 *
 * @example
 * ```ts
 * const { blob, ratio } = await compressVideo(file, { format: 'mp4', bitrate: '1M' });
 * ```
 */
export async function compressVideo(
  input: File | Blob,
  options: VideoOptions,
): Promise<CompressResult> {
  if (!options || typeof options !== 'object') {
    throw new InvalidOptionsError('Options object is required');
  }

  const format = (options.format || 'auto').toLowerCase();
  if (!VALID_VIDEO_FORMATS.has(format)) {
    throw new FormatNotSupportedError(
      `"${options.format}" is not a supported video format. Supported: mp4, webm`,
      options.format as string,
    );
  }

  const originalSize = input.size;

  const compressorOptions: CompressorOptions = {
    type: 'video',
    format: format === 'auto' ? 'mp4' : format,
    videoBitrate: options.bitrate,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    fps: options.fps,
    preserveMetadata: options.preserveMetadata,
    onProgress: options.onProgress,
    strict: options.strict,
  };

  const blob = await _compress(input, compressorOptions, options.signal);

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    ratio: originalSize > 0 ? blob.size / originalSize : 1,
    format: compressorOptions.format,
    file: null,
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
    logger.warn(
      `Format "${options.format}" is not a recognized ${options.type} format. Proceeding via Heavy Path.`,
    );
  }
  if (options.quality !== undefined && (options.quality < 0 || options.quality > 1)) {
    throw new InvalidOptionsError(
      `Quality must be between 0.0 and 1.0. Received: ${options.quality}`,
    );
  }
  if (
    options.maxSizeMB !== undefined &&
    (typeof options.maxSizeMB !== 'number' || options.maxSizeMB <= 0)
  ) {
    throw new InvalidOptionsError(
      `maxSizeMB must be a positive number. Received: ${options.maxSizeMB}`,
    );
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
export { WorkerConfig } from './core/config.js';
export { MT_SUPPORTED } from './adapters/browser/workerPool.js';
export { archive, archiveStream } from './archive.js';
export { default as Compressor } from './compat/compressor.js';
