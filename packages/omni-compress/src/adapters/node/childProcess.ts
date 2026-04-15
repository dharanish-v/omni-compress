import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';

import type { CompressorOptions } from '../../core/router.js';
import { fileToArrayBuffer } from '../../core/utils.js';
import { AbortError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

/**
 * Ensures the input is an ArrayBuffer (handling Blob/File in Node contexts)
 */
async function ensureBuffer(input: File | Blob | ArrayBuffer): Promise<Buffer> {
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }
  const arrayBuf = await fileToArrayBuffer(input);
  return Buffer.from(arrayBuf);
}

/**
 * Spawns a native FFmpeg child process to handle media conversion in Node.js/Electron.
 * Bypasses Wasm overhead entirely.
 */
export async function processWithNode(
  file: File | Blob | ArrayBuffer,
  options: CompressorOptions,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new AbortError('Compression aborted');
  const buffer = await ensureBuffer(file);
  const tempId = randomUUID();

  // We use the OS temp directory for processing
  const inputPath = join(tmpdir(), `input_${tempId}`);
  const outputPath = join(tmpdir(), `output_${tempId}.${options.format}`);

  // Guarantee FFmpeg availability: Use ffmpeg-static path if available, fallback to global 'ffmpeg'
  const binary = ffmpegPath || 'ffmpeg';
  logger.debug(`Using FFmpeg binary at: ${binary}`);

  try {
    // 1. Write the buffer to a temporary file
    await fs.writeFile(inputPath, buffer);

    // 2. Construct FFmpeg arguments based on type and options
    // -threads 0 = use all available CPU cores for all codec operations
    // Gap #8: -noautorotate must come before -i (input option)
    const args = ['-y', '-threads', '0'];
    if (options.checkOrientation === false) {
      args.push('-noautorotate');
    }
    args.push('-i', inputPath);

    // Metadata preservation
    if (options.preserveMetadata) {
      args.push('-map_metadata', '0');
    } else {
      args.push('-map_metadata', '-1');
    }

    if (options.type === 'image') {
      // Build video filter chain for resize options
      const vfFilters: string[] = [];

      // Gap #2-3: exact width/height with resize mode
      if (options.width || options.height) {
        const cW = options.width ?? 0;
        const cH = options.height ?? 0;
        const mode = options.resize ?? 'contain';

        if (mode === 'contain') {
          // Fit within cW×cH, pad with black/transparent to fill
          const scaleW = cW || -1;
          const scaleH = cH || -1;
          vfFilters.push(
            `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=decrease`,
            `pad=${cW || 'iw'}:${cH || 'ih'}:(ow-iw)/2:(oh-ih)/2`,
          );
        } else if (mode === 'cover') {
          // Fill cW×cH, crop overflow from centre
          const scaleW = cW || -1;
          const scaleH = cH || -1;
          vfFilters.push(
            `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase`,
            `crop=${cW || 'iw'}:${cH || 'ih'}`,
          );
        } else {
          // 'none': canvas = cW×cH, image drawn at its size (may clip)
          vfFilters.push(`scale=${cW || 'iw'}:${cH || 'ih'}`);
        }
      } else if (options.maxWidth || options.maxHeight) {
        // Gap #1 (maxWidth/maxHeight) — ceiling downscale, aspect-ratio preserving
        const w = options.maxWidth || -1;
        const h = options.maxHeight || -1;
        if (w !== -1 && h !== -1) {
          vfFilters.push(
            `scale='min(${w},iw)':'min(${h},ih)':force_original_aspect_ratio=decrease`,
          );
        } else {
          vfFilters.push(`scale=${w}:${h}`);
        }
      }

      // Gap #1: minWidth/minHeight — floor upscale, aspect-ratio preserving
      if (options.minWidth || options.minHeight) {
        const mW = options.minWidth || 0;
        const mH = options.minHeight || 0;
        if (mW && mH) {
          vfFilters.push(
            `scale='max(${mW},iw)':'max(${mH},ih)':force_original_aspect_ratio=increase`,
          );
        } else if (mW) {
          vfFilters.push(`scale='max(${mW},iw)':-1`);
        } else {
          vfFilters.push(`scale=-1:'max(${mH},ih)'`);
        }
      }

      if (vfFilters.length > 0) {
        args.push('-vf', vfFilters.join(','));
      }

      if (options.format === 'webp') {
        args.push('-vcodec', 'libwebp');
        if (options.quality !== undefined) {
          args.push('-q:v', Math.floor(options.quality * 100).toString());
        }
        // method 0 = fastest WebP encoding (speed vs compression tradeoff)
        // compression_level 0 = skip lossy pre-analysis passes (~2-3x speedup)
        args.push('-compression_level', '0', '-method', '0');
      } else if (options.format === 'avif') {
        // -b:v 0 required for CRF constrained-quality mode; -still-picture 1 for valid AVIF.
        const crf =
          options.quality !== undefined
            ? Math.max(0, Math.min(63, Math.round((1 - options.quality) * 63)))
            : 32;
        // cpu-used 8 = fastest libaom-av1 encoding (10-12x speedup vs default cpu-used 1)
        args.push(
          '-vcodec',
          'libaom-av1',
          '-crf',
          String(crf),
          '-b:v',
          '0',
          '-still-picture',
          '1',
          '-cpu-used',
          '8',
        );
      }
    } else if (options.type === 'audio') {
      if (options.channels) {
        args.push('-ac', options.channels.toString());
      }
      if (options.sampleRate) {
        args.push('-ar', options.sampleRate.toString());
      }

      if (options.format === 'mp3') {
        args.push('-acodec', 'libmp3lame', '-b:a', options.bitrate || '128k');
      } else if (options.format === 'flac') {
        args.push('-acodec', 'flac');
      } else if (options.format === 'opus') {
        args.push('-acodec', 'libopus', '-b:a', options.bitrate || '128k');
      } else if (options.format === 'aac') {
        args.push('-acodec', 'aac', '-b:a', options.bitrate || '128k');
      }
    } else if (options.type === 'video') {
      const videoVf: string[] = [];
      if (options.maxWidth || options.maxHeight) {
        const w = options.maxWidth || -1;
        const h = options.maxHeight || -1;
        if (w !== -1 && h !== -1) {
          videoVf.push(`scale='min(${w},iw)':'min(${h},ih)':force_original_aspect_ratio=decrease`);
        } else {
          videoVf.push(`scale=${w}:${h}`);
        }
      }
      if (videoVf.length > 0) {
        args.push('-vf', videoVf.join(','));
      }

      if (options.fps) {
        args.push('-r', options.fps.toString());
      }

      if (options.format === 'mp4') {
        args.push('-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast');
        if (options.videoBitrate) {
          args.push('-b:v', options.videoBitrate);
        } else {
          args.push('-crf', '28');
        }
        args.push('-acodec', 'aac', '-b:a', '128k');
      } else if (options.format === 'webm') {
        args.push('-vcodec', 'libvpx-vp9', '-deadline', 'realtime');
        if (options.videoBitrate) {
          args.push('-b:v', options.videoBitrate);
        }
        args.push('-acodec', 'libopus', '-b:a', '128k');
      }
    }

    args.push(outputPath);

    // 3. Execute FFmpeg
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args);

      // AbortSignal support (#21): kill the child process on abort
      const onAbort = () => {
        child.kill('SIGTERM');
        reject(new AbortError('Compression aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      // FFmpeg outputs progress and logs to stderr
      child.stderr.on('data', (data) => {
        const output = data.toString();
        logger.debug(`[OmniCompress:FFmpeg:Node] ${output.trim()}`);

        // Simple progress parsing logic (e.g., parsing "time=00:00:05.12")
        // Since we don't always know total duration here, we just emit periodic updates
        // In a more robust version, we'd probe total duration first.
        if (output.includes('time=')) {
          // For now, we'll just indicate we are working.
          // Native node is usually so fast for small files that 0 -> 100 is almost instant.
          options.onProgress?.(50);
        }
      });

      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) return; // already rejected by onAbort
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(
          new Error(
            `Failed to start FFmpeg child process: ${err.message}. Ensure ffmpeg is installed or ffmpeg-static is bundled.`,
          ),
        );
      });
    });

    // 4. Read the output file
    const resultBuffer = await fs.readFile(outputPath);

    // 5. Convert Node Buffer to standard Blob for unified return type
    let mimeType = '';
    if (options.type === 'image') {
      mimeType = options.format === 'jpg' ? 'image/jpeg' : `image/${options.format}`;
    } else if (options.type === 'audio') {
      mimeType = options.format === 'opus' ? 'audio/ogg' : `audio/${options.format}`;
    } else {
      mimeType = options.format === 'mp4' ? 'video/mp4' : `video/${options.format}`;
    }

    // Convert Buffer to ArrayBuffer to Blob for standard web API compliance
    const arrayBuffer = resultBuffer.buffer.slice(
      resultBuffer.byteOffset,
      resultBuffer.byteOffset + resultBuffer.byteLength,
    );

    return new Blob([arrayBuffer], { type: mimeType });
  } finally {
    // 6. Cleanup temporary files regardless of success/failure
    try {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch (cleanupError) {
      logger.warn('Failed to clean up Node.js temporary files:', cleanupError);
    }
  }
}
