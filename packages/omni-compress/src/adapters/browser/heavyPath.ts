import type { CompressorOptions } from '../../core/router.js';
import { SAFE_SIZE_LIMITS } from '../../core/utils.js';
import { logger } from '../../core/logger.js';
import { buildImageVfFilters } from '../../core/ffmpegFilters.js';

// --- FFmpeg Singleton (ST — single-threaded core) ---
// Reuses a single FFmpeg Wasm instance across compressions within the same
// Web Worker, cleaning only the Virtual File System between calls.
// The instance self-terminates after an idle timeout to free Wasm memory.

interface FFmpegConfig {
  coreUrl?: string;
  wasmUrl?: string;
  workerUrl?: string;
  mtSupported?: boolean;
}

let singletonFFmpeg: any = null;
let singletonPromise: Promise<any> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let currentMtSupported: boolean = false;

const IDLE_TIMEOUT_MS = 30_000; // 30 seconds

function resetIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    if (singletonFFmpeg) {
      logger.debug('FFmpeg idle timeout reached. Terminating singleton.');
      try {
        singletonFFmpeg.terminate();
      } catch (_e) {
        // Already terminated or never fully loaded
      }
      singletonFFmpeg = null;
      singletonPromise = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function getFFmpeg(config?: FFmpegConfig) {
  if (singletonFFmpeg) {
    resetIdleTimer();
    return singletonFFmpeg;
  }

  if (singletonPromise) {
    return singletonPromise;
  }

  singletonPromise = (async () => {
    const isMT = config?.mtSupported ?? false;
    currentMtSupported = isMT;

    logger.debug(`Initializing FFmpeg Wasm singleton (Multi-threaded: ${isMT})...`);
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }: { message: string }) => {
      logger.debug(`[FFmpeg] ${message}`);
    });

    try {
      const loadConfig: any = {};

      if (config?.coreUrl) {
        // If custom URLs are provided, use them
        const coreType = isMT ? 'text/javascript' : 'text/javascript';
        loadConfig.coreURL = await toBlobURL(config.coreUrl, coreType);
        if (config.wasmUrl)
          loadConfig.wasmURL = await toBlobURL(config.wasmUrl, 'application/wasm');
        if (isMT && config.workerUrl)
          loadConfig.workerURL = await toBlobURL(config.workerUrl, 'text/javascript');
      } else {
        // Default: Use @ffmpeg/core or @ffmpeg/core-mt from unpkg or local node_modules
        // (Default behavior of ffmpeg.load() is usually sufficient if files are co-located)
        if (isMT) {
          // Force multi-threaded core
          const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
          loadConfig.coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
          loadConfig.wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
          loadConfig.workerURL = await toBlobURL(
            `${baseURL}/ffmpeg-core.worker.js`,
            'text/javascript',
          );
        }
      }

      await ffmpeg.load(loadConfig);
      logger.debug(`FFmpeg Wasm singleton loaded successfully. MT: ${isMT}`);
      singletonFFmpeg = ffmpeg;
      resetIdleTimer();
      return ffmpeg;
    } catch (err) {
      logger.error('Failed to load FFmpeg Wasm:', err);
      singletonPromise = null;
      throw err;
    }
  })();

  return singletonPromise;
}

export async function processImageHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
  ffmpegConfig?: FFmpegConfig,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe Wasm limit (250 MB). ` +
        `Refusing to load into FFmpeg to prevent memory exhaustion.`,
    );
  }

  const ffmpeg = await getFFmpeg(ffmpegConfig);
  const threadCount = currentMtSupported ? '0' : '1'; // 0 = auto (use all cores)

  const ext = options.originalFileName?.split('.').pop()?.toLowerCase() || 'img';
  const inputFileName = `input.${ext}`;
  const outputFileName = `output.${options.format}`;

  const fileData = new Uint8Array(buffer);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress * 100);
  };

  try {
    ffmpeg.on('progress', progressHandler);
    await ffmpeg.writeFile(inputFileName, fileData);

    // -map 0:v:0: Select only the first video stream
    const args = ['-nostdin', '-y', '-threads', threadCount, '-i', inputFileName, '-map', '0:v:0'];

    if (!options.preserveMetadata) {
      args.push('-map_metadata', '-1');
    }

    const vfFilters = buildImageVfFilters(options);
    if (vfFilters.length > 0) {
      args.push('-vf', vfFilters.join(','));
    }

    // Large AVIF (worker path) reaches here; small AVIF (main-thread path) uses @jsquash/avif instead.
    if (options.format === 'webp') {
      args.push('-c:v', 'libwebp');
      if (options.quality !== undefined) {
        args.push('-q:v', Math.floor(options.quality * 100).toString());
      }
      // method 0 = fastest encode (skip pre-analysis passes), ~2-3x speedup in Wasm
      args.push('-compression_level', '0', '-method', '0');
    }

    args.push(outputFileName);

    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error(`FFmpeg image conversion failed (code ${code}).`);

    const resultData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    return resultData.slice().buffer; // Copy out of Wasm heap
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_e) {}
    resetIdleTimer();
  }
}

export async function processAudioHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
  ffmpegConfig?: FFmpegConfig,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe Wasm limit (250 MB). ` +
        `Refusing to load into FFmpeg to prevent memory exhaustion.`,
    );
  }

  const ffmpeg = await getFFmpeg(ffmpegConfig);
  const threadCount = currentMtSupported ? '0' : '1';

  const ext = options.originalFileName?.split('.').pop()?.toLowerCase() || 'audio';
  const inputFileName = `input.${ext}`;
  const outputFileName = `output.${options.format}`;

  const fileData = new Uint8Array(buffer);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress * 100);
  };

  try {
    ffmpeg.on('progress', progressHandler);
    await ffmpeg.writeFile(inputFileName, fileData);

    if (options.format === 'opus') {
      // With MT support, Opus might be more stable, but we'll keep the two-pass
      // approach for now as it's guaranteed to be safe for memory.
      const intermediateFile = 'resampled.wav';
      const opusOutputFile = 'output.ogg';

      // Pass 1: Resample to 48kHz PCM
      const resampleArgs = [
        '-nostdin',
        '-y',
        '-threads',
        threadCount,
        '-i',
        inputFileName,
        '-map',
        '0:a',
        '-map_metadata',
        '-1',
        '-ar',
        '48000',
        '-c:a',
        'pcm_s16le',
        intermediateFile,
      ];
      const resampleCode = await ffmpeg.exec(resampleArgs);
      if (resampleCode !== 0)
        throw new Error(`FFmpeg audio resampling failed (code ${resampleCode}).`);

      try {
        await ffmpeg.deleteFile(inputFileName);
      } catch (_e) {}

      // Pass 2: Encode resampled audio to Opus
      const encodeArgs = [
        '-nostdin',
        '-y',
        '-threads',
        threadCount,
        '-i',
        intermediateFile,
        '-c:a',
        'libopus',
        '-b:a',
        options.bitrate || '128k',
        '-compression_level',
        '0',
        '-frame_duration',
        '20',
        '-application',
        'audio',
      ];

      if (options.channels) encodeArgs.push('-ac', options.channels.toString());
      encodeArgs.push(opusOutputFile);

      const encodeCode = await ffmpeg.exec(encodeArgs);
      if (encodeCode !== 0) throw new Error(`FFmpeg Opus encoding failed (code ${encodeCode}).`);

      try {
        await ffmpeg.deleteFile(intermediateFile);
      } catch (_e) {}

      const resultData = (await ffmpeg.readFile(opusOutputFile)) as Uint8Array;
      try {
        await ffmpeg.deleteFile(opusOutputFile);
      } catch (_e) {}
      return resultData.slice().buffer;
    } else {
      const args = ['-nostdin', '-y', '-threads', threadCount, '-i', inputFileName, '-map', '0:a'];

      if (!options.preserveMetadata) {
        args.push('-map_metadata', '-1');
      }

      if (options.channels) args.push('-ac', options.channels.toString());
      if (options.sampleRate) args.push('-ar', options.sampleRate.toString());

      if (options.format === 'mp3') {
        // compression_level 9 = fastest libmp3lame encode (~15-25% faster in Wasm)
        args.push(
          '-c:a',
          'libmp3lame',
          '-b:a',
          options.bitrate || '128k',
          '-compression_level',
          '9',
        );
      } else if (options.format === 'flac') {
        // FLAC level 0 = fastest (still lossless, just less pre-analysis)
        args.push('-c:a', 'flac', '-compression_level', '0');
      }

      args.push(outputFileName);

      const code = await ffmpeg.exec(args);
      if (code !== 0) throw new Error(`FFmpeg audio conversion failed (code ${code}).`);
    }

    const resultData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    return resultData.slice().buffer; // Copy out of Wasm heap
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_e) {}
    resetIdleTimer();
  }
}

/**
 * HEAVY PATH: Video Processing (FFmpeg Wasm)
 */
export async function processVideoHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
  ffmpegConfig?: FFmpegConfig,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe Wasm limit (250 MB). ` +
        `Refusing to load into FFmpeg.`,
    );
  }

  const ffmpeg = await getFFmpeg(ffmpegConfig);
  const threadCount = currentMtSupported ? '0' : '1';

  const ext = options.originalFileName?.split('.').pop()?.toLowerCase() || 'video';
  const inputFileName = `input.${ext}`;
  const outputFileName = `output.${options.format}`;

  const fileData = new Uint8Array(buffer);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress * 100);
  };

  try {
    ffmpeg.on('progress', progressHandler);
    await ffmpeg.writeFile(inputFileName, fileData);

    const args = ['-nostdin', '-y', '-threads', threadCount, '-i', inputFileName];

    if (!options.preserveMetadata) {
      args.push('-map_metadata', '-1');
    }

    if (options.maxWidth || options.maxHeight) {
      const w = options.maxWidth || -1;
      const h = options.maxHeight || -1;
      args.push('-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    }

    if (options.format === 'mp4') {
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast');
      if (options.videoBitrate) {
        args.push('-b:v', options.videoBitrate);
      } else {
        args.push('-crf', '28');
      }
      args.push('-c:a', 'aac', '-b:a', '128k');
    } else if (options.format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-deadline', 'realtime');
      if (options.videoBitrate) {
        args.push('-b:v', options.videoBitrate);
      }
      args.push('-c:a', 'libopus', '-b:a', '128k');
    }

    if (options.fps) {
      args.push('-r', options.fps.toString());
    }

    args.push(outputFileName);

    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error(`FFmpeg video conversion failed (code ${code}).`);

    const resultData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    return resultData.slice().buffer;
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_e) {}
    resetIdleTimer();
  }
}
