import { processImageFastPath } from '../adapters/browser/fastPath.js';
import { processImageHeavyPath } from '../adapters/browser/heavyPath.js';
import { logger } from '../core/logger.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer: inputData, options, isFastPath, ffmpegConfig } = event.data;

  try {
    // 1. Ensure we have an ArrayBuffer
    // (Input can now be File | Blob or ArrayBuffer)
    let buffer: ArrayBuffer;
    if (inputData instanceof ArrayBuffer) {
      buffer = inputData;
    } else if (inputData instanceof Blob) {
      buffer = await inputData.arrayBuffer();
    } else {
      throw new Error('Worker:Image invalid input data type');
    }

    let resultBuffer: ArrayBuffer;

    if (options.format === 'avif') {
      // AVIF in the worker goes straight to FFmpeg (heavy path).
      //
      // @jsquash/avif cannot be bundled into this worker by Vite — when SAB is
      // available (COOP/COEP), its Emscripten MT init calls
      //   new Worker(new URL("avif_enc_mt.worker.mjs", import.meta.url))
      // but Vite hashes that filename, so the sub-worker 404s and crashes the
      // whole image worker (empty ErrorEvent, no message).
      //
      // Small AVIF (< avifMainThreadThreshold) still uses @jsquash/avif on the
      // main thread via mainThread.ts — only large AVIF hits this code path.
      resultBuffer = await processImageHeavyPath(
        buffer,
        options,
        (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        },
        ffmpegConfig,
      );
    } else if (isFastPath) {
      try {
        resultBuffer = await processImageFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(
          `Worker:Image Fast Path failed, falling back to Heavy Path: ${fastPathError.message}`,
        );
        resultBuffer = await processImageHeavyPath(
          buffer,
          options,
          (progress) => {
            self.postMessage({ id, type: 'progress', progress });
          },
          ffmpegConfig,
        );
      }
    } else {
      resultBuffer = await processImageHeavyPath(
        buffer,
        options,
        (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        },
        ffmpegConfig,
      );
    }

    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
