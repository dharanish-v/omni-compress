import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
// @ts-ignore
import ffmpegPath from 'ffmpeg-static';

import type { CompressorOptions } from '../../core/router.js';
import { fileToArrayBuffer } from '../../core/utils.js';
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
  options: CompressorOptions
): Promise<Blob> {
  const buffer = await ensureBuffer(file);
  const tempId = Math.random().toString(36).substring(2, 15);
  
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
    const args = ['-y', '-i', inputPath]; // -y overwrites output if it exists

    if (options.type === 'image') {
      if (options.quality !== undefined) {
        args.push('-q:v', Math.floor(options.quality * 100).toString());
      }
    } else if (options.type === 'audio') {
      // Simplified default for audio
      args.push('-b:a', '128k');
    }

    args.push(outputPath);

    // 3. Execute FFmpeg
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args);

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg child process: ${err.message}. Ensure ffmpeg is installed or ffmpeg-static is bundled.`));
      });
    });

    // 4. Read the output file
    const resultBuffer = await fs.readFile(outputPath);

    // 5. Convert Node Buffer to standard Blob for unified return type
    let mimeType = '';
    if (options.type === 'image') {
      mimeType = options.format === 'jpg' ? 'image/jpeg' : `image/${options.format}`;
    } else {
      mimeType = `audio/${options.format}`;
    }

    // Convert Buffer to ArrayBuffer to Blob for standard web API compliance
    const arrayBuffer = resultBuffer.buffer.slice(
      resultBuffer.byteOffset,
      resultBuffer.byteOffset + resultBuffer.byteLength
    );

    return new Blob([arrayBuffer], { type: mimeType });

  } finally {
    // 6. Cleanup temporary files regardless of success/failure
    try {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch (cleanupError) {
      console.warn('Failed to clean up Node.js temporary files:', cleanupError);
    }
  }
}
