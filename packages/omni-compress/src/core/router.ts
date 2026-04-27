import { WorkerConfig, MAIN_THREAD_THRESHOLDS } from './config.js';

type WorkerType = 'image' | 'audio' | 'video';

// ---------------------------------------------------------------------------
// v1.x legacy types — kept for the deprecated OmniCompressor.process() shim
// ---------------------------------------------------------------------------

export interface CompressorOptions {
  type: 'image' | 'audio' | 'video';
  format:
    | 'webp'
    | 'avif'
    | 'jpeg'
    | 'png'
    | 'opus'
    | 'mp3'
    | 'flac'
    | 'wav'
    | 'auto'
    | 'mp4'
    | 'webm'
    | string;
  maxSizeMB?: number;
  quality?: number; // 0.0 to 1.0
  onProgress?: (percent: number) => void;
  originalFileName?: string;
  /**
   * Explicitly force Web Worker usage (true) or Main Thread usage (false).
   */
  useWorker?: boolean;
  /**
   * If the compressed file is larger than the original, return the original.
   * Default: false.
   */
  strict?: boolean;
  // Advanced Image Options
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
  width?: number;
  height?: number;
  resize?: 'contain' | 'cover' | 'none';
  checkOrientation?: boolean;
  retainExif?: boolean;
  beforeDraw?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
  drew?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
  preserveMetadata?: boolean;
  // Advanced Audio Options
  bitrate?: string; // e.g., '128k', '192k'
  channels?: 1 | 2;
  sampleRate?: number;
  // Advanced Video Options
  videoBitrate?: string; // e.g., '1M', '2M'
  fps?: number;
}

// ---------------------------------------------------------------------------
// v2.0 API types
// ---------------------------------------------------------------------------

/**
 * The result of a v2.0 compression call.
 * Replaces the raw `Blob` return from v1.x.
 */
export interface CompressResult {
  /** The compressed output blob, ready to save or upload. */
  blob: Blob;
  /** Size of the input file in bytes. */
  originalSize: number;
  /** Size of the output blob in bytes. */
  compressedSize: number;
  /** compressedSize / originalSize — values below 1.0 indicate actual compression. */
  ratio: number;
  /** The target format that was used (e.g. 'webp', 'opus'). */
  format: string;
  /**
   * A `File` object with the output blob content and a corrected filename extension.
   * `null` when the input was a plain `Blob` (no original filename).
   */
  file: File | null;
  /**
   * Final encoder quality used (0.0–1.0). Set when `maxSizeMB` binary search
   * ran and converged. `undefined` for single-pass compressions.
   */
  quality?: number;
}

/** Options for compressImage(). */
export interface ImageOptions {
  /** Target output format. Default: 'auto' (converts PNG/JPEG to WebP). */
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
  /** Encoder quality from 0.0 (worst) to 1.0 (best). Default: 0.8. */
  quality?: number;
  /**
   * Target output file size in megabytes. When set, the library runs a binary
   * search over quality values (up to 6 passes) to find the highest quality
   * that produces output ≤ `maxSizeMB`. Applies to lossy formats only
   * (WebP, JPEG, AVIF). PNG is lossless and ignores this option.
   *
   * If the target cannot be reached at minimum quality (0.05), the
   * smallest achievable result is returned with a console warning.
   *
   * @example
   * ```ts
   * // Enforce a 500 KB output ceiling
   * const { blob, quality } = await compressImage(file, {
   *   format: 'webp',
   *   maxSizeMB: 0.5,
   * });
   * console.log(`Final quality: ${quality}`);
   * ```
   */
  maxSizeMB?: number;
  /** Resize output width to at most this many pixels (maintains aspect ratio). */
  maxWidth?: number;
  /** Resize output height to at most this many pixels (maintains aspect ratio). */
  maxHeight?: number;
  /** Scale up if output width is below this value (maintains aspect ratio). */
  minWidth?: number;
  /** Scale up if output height is below this value (maintains aspect ratio). */
  minHeight?: number;
  /** Exact output canvas width in pixels. Use with `resize` to control fitting. */
  width?: number;
  /** Exact output canvas height in pixels. Use with `resize` to control fitting. */
  height?: number;
  /**
   * Resize mode when both `width` and `height` are set.
   * - `'contain'` (default): scale to fit within the canvas, letterbox if needed.
   * - `'cover'`: scale to fill the canvas, cropping the overflow.
   * - `'none'`: draw the image at its current size; canvas is cropped/padded.
   */
  resize?: 'contain' | 'cover' | 'none';
  /**
   * MIME type(s) eligible for auto format conversion (e.g. `'image/png'`).
   * When the input's MIME type matches one of these AND the file size is below
   * `convertSize`, the format is locked to the input format (no conversion).
   * Default: `[]` (no restriction).
   */
  convertTypes?: string | string[];
  /**
   * Minimum file size (bytes) that triggers `convertTypes` auto-conversion.
   * Files below this threshold keep their original format.
   * Default: `5242880` (5 MB).
   */
  convertSize?: number;
  /**
   * Called on the canvas context after the canvas is created and filled,
   * but before the image bitmap is drawn. Useful for applying background colours
   * or watermarks. Browser fast path only (no-op on FFmpeg / Node paths).
   */
  beforeDraw?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
  /**
   * Called on the canvas context after the image bitmap has been drawn,
   * but before the canvas is encoded. Useful for overlays or post-processing.
   * Browser fast path only (no-op on FFmpeg / Node paths).
   */
  drew?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
  /**
   * When `true` (default), EXIF orientation is applied automatically so the
   * image is upright. Set to `false` to preserve the raw pixel orientation.
   */
  checkOrientation?: boolean;
  /**
   * When `true`, the original EXIF metadata is re-injected into the JPEG output.
   * Only applies to JPEG input compressed to JPEG output on the browser fast path.
   * Default: `false`.
   */
  retainExif?: boolean;
  /** When true, EXIF/metadata is preserved in the output. Default: false (stripped). */
  preserveMetadata?: boolean;
  /**
   * If the compressed image is larger than the original, return the original.
   * Default: false.
   */
  strict?: boolean;
  /**
   * Explicitly force Web Worker usage (true) or Main Thread usage (false).
   * If omitted, the library chooses based on file size and operation type.
   */
  useWorker?: boolean;
  /** Called with progress 0–100 during heavy-path (FFmpeg) operations. */
  onProgress?: (percent: number) => void;
  /** Cancel the operation. Throws AbortError when signalled. */
  signal?: AbortSignal;
}

/** Options for compressAudio(). */
export interface AudioOptions {
  /** Target output format. Default: 'auto' (converts WAV/FLAC to MP3). */
  format?: 'opus' | 'mp3' | 'flac' | 'wav' | 'aac' | 'auto';
  /** Target bitrate, e.g. '128k', '192k'. Encoder default if omitted. */
  bitrate?: string;
  /** Output channel count. Defaults to input channel count. */
  channels?: 1 | 2;
  /** Output sample rate in Hz. Defaults to input sample rate. */
  sampleRate?: number;
  /** When true, audio tags/metadata is preserved. Default: false (stripped). */
  preserveMetadata?: boolean;
  /**
   * If the compressed audio is larger than the original, return the original.
   * Default: false.
   */
  strict?: boolean;
  /**
   * Explicitly force Web Worker usage (true) or Main Thread usage (false).
   * If omitted, the library chooses based on file size and operation type.
   */
  useWorker?: boolean;
  /** Called with progress 0–100 during FFmpeg operations. */
  onProgress?: (percent: number) => void;
  /** Cancel the operation. Throws AbortError when signalled. */
  signal?: AbortSignal;
}

/** Options for compressVideo(). */
export interface VideoOptions {
  /** Target output format. Default: 'mp4'. */
  format?: 'mp4' | 'webm';
  /** Target video bitrate, e.g. '1M', '2M'. Default: '1M'. */
  bitrate?: string;
  /** Resize output width to at most this many pixels (maintains aspect ratio). */
  maxWidth?: number;
  /** Resize output height to at most this many pixels (maintains aspect ratio). */
  maxHeight?: number;
  /** Output frames per second. Default: input FPS. */
  fps?: number;
  /** When true, metadata is preserved. Default: false (stripped). */
  preserveMetadata?: boolean;
  /**
   * If the compressed video is larger than the original, return the original.
   * Default: false.
   */
  strict?: boolean;
  /**
   * Explicitly force Web Worker usage (true) or Main Thread usage (false).
   * If omitted, the library chooses based on file size and operation type.
   */
  useWorker?: boolean;
  /** Called with progress 0–100 during processing. */
  onProgress?: (percent: number) => void;
  /** Cancel the operation. Throws AbortError when signalled. */
  signal?: AbortSignal;
}

/** A single file entry for the archive() / archiveStream() functions. */
export interface ArchiveEntry {
  /** Path/name of the file inside the ZIP (e.g. 'images/photo.webp'). */
  name: string;
  /** File contents. File and Blob are read via .arrayBuffer(). */
  data: File | Blob | Uint8Array;
}

/** Options for archive() and archiveStream(). */
export interface ArchiveOptions {
  /** Archive format. Currently only 'zip'. Default: 'zip'. */
  format?: 'zip';
  /**
   * fflate deflate compression level (0 = store, 1 = fastest, 9 = best compression).
   * Default: 6.
   */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /**
   * When true, image and audio files are automatically compressed to optimized
   * formats (WebP/MP3) before being added to the archive.
   * Default: false.
   */
  smartOptimize?: boolean;
  /** Called with progress 0–100 as entries are processed. */
  onProgress?: (percent: number) => void;
  /** Cancel the operation. Throws AbortError when signalled. */
  signal?: AbortSignal;
}

/** Result of archive(). */
export interface ArchiveResult {
  /** The compressed ZIP blob. */
  blob: Blob;
  /** Total uncompressed size of all entries in bytes. */
  originalSize: number;
  /** Size of the ZIP output in bytes. */
  compressedSize: number;
  /** compressedSize / originalSize. */
  ratio: number;
  /** Always 'zip' for now. */
  format: 'zip';
}

export type Environment = 'browser' | 'node';

export interface RouteContext {
  env: Environment;
  isFastPath: boolean;
  /**
   * If true, the task should be dispatched to a Web Worker.
   * If false, the task can run on the main thread for lower latency (small files).
   */
  shouldUseWorker: boolean;
}

// AVIF intentionally excluded from OffscreenCanvas fast path:
// OffscreenCanvas cannot encode AVIF (issue #35).
const FAST_PATH_IMAGE_FORMATS = new Set(['webp', 'jpeg', 'png', 'jpg']);
// Note: Native browser encoding support for opus/mp3 varies.
// AAC and Opus are widely supported via WebCodecs.
const FAST_PATH_AUDIO_FORMATS = new Set(['aac', 'opus']);
// WebCodecs VideoEncoder supports H.264 and AV1.
const FAST_PATH_VIDEO_FORMATS = new Set(['mp4', 'webm']);

/**
 * Evaluates the execution environment and selects the optimal compression
 * engine for each operation (fast path, AVIF encoder, heavy path / Node).
 */
export class Router {
  /**
   * Detects whether the current runtime is Node.js or a browser.
   * Node.js is identified by the presence of `process.versions.node`.
   */
  static getEnvironment(): Environment {
    if (typeof process !== 'undefined' && process.versions != null && process.versions.node) {
      return 'node';
    }
    return 'browser';
  }

  /**
   * Returns `true` if the format can be encoded without FFmpeg Wasm in the browser.
   * - Images: OffscreenCanvas → WebP, JPEG, PNG
   * - Audio: WebCodecs AudioEncoder → AAC, Opus
   * - Video: WebCodecs VideoEncoder → H.264 (MP4), VP8/VP9 (WebM)
   *
   * Always returns `false` in Node.js (which uses native child_process instead).
   */
  static isFastPathSupported(options: CompressorOptions): boolean {
    if (this.getEnvironment() === 'node') return false; // Node delegates to native child_process

    const format = options.format.toLowerCase();

    if (options.type === 'image') {
      // Browsers generally support OffscreenCanvas encoding to these formats
      return FAST_PATH_IMAGE_FORMATS.has(format);
    } else if (options.type === 'audio') {
      // Browsers can sometimes encode these natively
      return FAST_PATH_AUDIO_FORMATS.has(format);
    } else {
      // Video Fast Path (WebCodecs VideoEncoder) not yet implemented — see issue #55.
      // processVideoFastPath always throws; returning true here causes a wasteful
      // main-thread attempt before falling back to the Worker every time.
      void FAST_PATH_VIDEO_FORMATS; // keep the set for documentation purposes
      return false;
    }
  }

  /**
   * Determines the full routing context for a compression job.
   *
   * Combines environment detection, fast-path eligibility, and file-size
   * thresholds to decide whether to run on the main thread or in a Web Worker.
   *
   * @param options - The compression options including type and format.
   * @param fileSize - Input file size in bytes.
   * @param inputMimeType - MIME type of the input (e.g. `'audio/wav'`). Used to
   *   short-circuit audio fast-path for non-WAV inputs that would otherwise throw.
   * @param isWorkerWarmFn - Optional callback that returns true when a Worker of
   *   the given type is already initialised. When warm, a lower threshold is used
   *   (cold-start cost is gone; only postMessage overhead remains).
   * @returns A {@link RouteContext} describing the chosen execution path.
   */
  static evaluate(
    options: CompressorOptions,
    fileSize: number,
    inputMimeType = '',
    isWorkerWarmFn?: (type: WorkerType) => boolean,
  ): RouteContext {
    const env = this.getEnvironment();
    const isFastPath = this.isFastPathSupported(options);
    const format = options.format.toLowerCase();

    let shouldUseWorker = true;

    if (env === 'browser') {
      // 1. Explicit user override
      if (options.useWorker !== undefined) {
        shouldUseWorker = options.useWorker;
      } else {
        // 2. Automated routing based on file size, type, and worker warmth
        const isAVIF = format === 'avif';
        const isMainThreadEligible = isFastPath || isAVIF;

        if (isMainThreadEligible) {
          if (options.type === 'audio' && isFastPath) {
            // WebCodecs audio fast path only demuxes WAV input (decodeAudio in fastPath.ts).
            // Non-WAV inputs throw immediately on the main thread, then retry in the Worker
            // where they also throw, wasting two dispatch cycles before reaching FFmpeg.
            // Skip the main-thread attempt entirely for non-WAV audio.
            const isWavInput =
              inputMimeType === 'audio/wav' ||
              inputMimeType === 'audio/wave' ||
              inputMimeType === 'audio/x-wav';

            if (isWavInput) {
              const warm = isWorkerWarmFn?.('audio') ?? false;
              const threshold = warm
                ? WorkerConfig.warmWorkerThreshold
                : WorkerConfig.audioMainThreadThreshold;
              shouldUseWorker = fileSize >= threshold;
            }
            // Non-WAV: shouldUseWorker stays true → goes straight to Worker
          } else {
            const coldThreshold = isAVIF
              ? WorkerConfig.avifMainThreadThreshold
              : (MAIN_THREAD_THRESHOLDS[format] ?? WorkerConfig.mainThreadThreshold);
            const warm = isWorkerWarmFn?.(options.type as WorkerType) ?? false;
            const threshold = warm ? WorkerConfig.warmWorkerThreshold : coldThreshold;
            shouldUseWorker = fileSize >= threshold;
          }
        }
      }
    }

    return {
      env,
      isFastPath,
      shouldUseWorker,
    };
  }
}
