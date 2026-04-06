import { processVideoFastPath } from '../adapters/browser/fastPath.js';
import { processVideoHeavyPath } from '../adapters/browser/heavyPath.js';
import { logger } from '../core/logger.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, options, isFastPath, ffmpegConfig } = event.data;

  logger.debug(`Worker:Video starting task ${id}. FastPath: ${isFastPath}`);

  try {
    let resultBuffer: ArrayBuffer;

    if (isFastPath) {
      try {
        logger.debug('Worker:Video executing Fast Path');
        resultBuffer = await processVideoFastPath(buffer, options);
      } catch (fastPathError: any) {
        logger.warn(
          `Worker:Video Fast Path failed: ${fastPathError.message}. Falling back to Heavy Path.`
        );
        resultBuffer = await processVideoHeavyPath(buffer, options, (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        }, ffmpegConfig);
      }
    } else {
      logger.debug('Worker:Video executing Heavy Path (FFmpeg)');
      resultBuffer = await processVideoHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      }, ffmpegConfig);
    }

    logger.debug(`Worker:Video task ${id} complete. Transferring buffer back.`);
    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    logger.error(`Worker:Video error in task ${id}:`, error);
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
