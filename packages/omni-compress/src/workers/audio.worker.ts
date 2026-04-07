import { processAudioFastPath } from '../adapters/browser/fastPath.js';
import { processAudioHeavyPath } from '../adapters/browser/heavyPath.js';
import { logger } from '../core/logger.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer: inputData, options, isFastPath, ffmpegConfig } = event.data;

  try {
    // Ensure we have an ArrayBuffer
    let buffer: ArrayBuffer;
    if (inputData instanceof ArrayBuffer) {
      buffer = inputData;
    } else if (inputData instanceof Blob) {
      buffer = await inputData.arrayBuffer();
    } else {
      throw new Error('Worker:Audio invalid input data type');
    }

    let resultBuffer: ArrayBuffer;

    if (isFastPath) {
      try {
        resultBuffer = await processAudioFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(`Worker:Audio Fast Path failed, falling back to Heavy Path: ${fastPathError.message}`);
        resultBuffer = await processAudioHeavyPath(buffer, options, (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        }, ffmpegConfig);
      }
    } else {
      resultBuffer = await processAudioHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      }, ffmpegConfig);
    }

    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    logger.error(`Worker:Audio error in task ${id}:`, error);
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
