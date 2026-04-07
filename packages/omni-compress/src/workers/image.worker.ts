import { processImageFastPath } from '../adapters/browser/fastPath.js';
import { processImageHeavyPath } from '../adapters/browser/heavyPath.js';
import { encodeAVIF } from '../adapters/browser/avifEncoder.js';
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
      resultBuffer = await encodeAVIF(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
    } else if (isFastPath) {
      try {
        resultBuffer = await processImageFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(`Worker:Image Fast Path failed, falling back to Heavy Path: ${fastPathError.message}`);
        resultBuffer = await processImageHeavyPath(buffer, options, (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        }, ffmpegConfig);
      }
    } else {
      resultBuffer = await processImageHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      }, ffmpegConfig);
    }

    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
