import { processImageFastPath } from '../adapters/browser/fastPath.js';
import { processImageHeavyPath } from '../adapters/browser/heavyPath.js';
import { encodeAVIF } from '../adapters/browser/avifEncoder.js';
import { logger } from '../core/logger.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, options, isFastPath } = event.data;

  try {
    let resultBuffer: ArrayBuffer;

    if (options.format === 'avif') {
      // AVIF uses @jsquash/avif (standalone libaom-av1 Wasm, ~1.1 MB gzipped).
      // Bypasses FFmpeg entirely — no SharedArrayBuffer or COOP/COEP required.
      resultBuffer = await encodeAVIF(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
    } else if (isFastPath) {
      try {
        resultBuffer = await processImageFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(
          `Worker:Image Fast Path failed: ${fastPathError.message}. Falling back to Heavy Path.`
        );
        resultBuffer = await processImageHeavyPath(buffer, options, (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        });
      }
    } else {
      resultBuffer = await processImageHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
    }

    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
