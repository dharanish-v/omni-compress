import { processAudioFastPath } from '../adapters/browser/fastPath.js';
import { processAudioHeavyPath } from '../adapters/browser/heavyPath.js';
import { logger } from '../core/logger.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, options, isFastPath } = event.data;

  logger.debug(`Worker:Audio starting task ${id}. FastPath: ${isFastPath}`);

  try {
    let resultBuffer: ArrayBuffer;

    if (isFastPath) {
      try {
        logger.debug('Worker:Audio executing Fast Path');
        resultBuffer = await processAudioFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(
          `Worker:Audio Fast Path failed: ${fastPathError.message}. Falling back to Heavy Path.`
        );
        resultBuffer = await processAudioHeavyPath(buffer, options, (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        });
      }
    } else {
      logger.debug('Worker:Audio executing Heavy Path (FFmpeg)');
      resultBuffer = await processAudioHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
    }

    logger.debug(`Worker:Audio task ${id} complete. Transferring buffer back.`);
    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    logger.error(`Worker:Audio error in task ${id}:`, error);
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
