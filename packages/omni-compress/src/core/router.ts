import { WorkerConfig } from './config.js';

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
}

/** Options for compressImage(). */
export interface ImageOptions {
  /** Target output format. Default: 'auto' (converts PNG/JPEG to WebP). */
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
  /** Encoder quality from 0.0 (worst) to 1.0 (best). Default: 0.8. */
  quality?: number;
  /** Resize output width to at most this many pixels (maintains aspect ratio). */
  maxWidth?: number;
  /** Resize output height to at most this many pixels (maintains aspect ratio). */
  maxHeight?: number;
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
      // Video Fast Path via WebCodecs
      return FAST_PATH_VIDEO_FORMATS.has(format);
    }
  }

  /**
   * Determines the full routing context for a compression job.
   *
   * Combines environment detection, fast-path eligibility, and file-size
   * thresholds to decide whether to run on the main thread or in a Web Worker.
   *
   * @param options - The compression options including type and format.
   * @param fileSize - Input file size in bytes (used for main-thread vs Worker routing).
   * @returns A {@link RouteContext} describing the chosen execution path.
   */
  static evaluate(options: CompressorOptions, fileSize: number): RouteContext {
    const env = this.getEnvironment();
    const isFastPath = this.isFastPathSupported(options);
    const format = options.format.toLowerCase();

    let shouldUseWorker = true;

    if (env === 'browser') {
      // 1. Explicit user override
      if (options.useWorker !== undefined) {
        shouldUseWorker = options.useWorker;
      } else {
        // 2. Automated routing based on file size and type
        const isAVIF = format === 'avif';
        const isMainThreadEligible = isFastPath || isAVIF;

        if (isMainThreadEligible) {
          const threshold = isAVIF
            ? WorkerConfig.avifMainThreadThreshold
            : WorkerConfig.mainThreadThreshold;

          if (fileSize < threshold) {
            shouldUseWorker = false;
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
