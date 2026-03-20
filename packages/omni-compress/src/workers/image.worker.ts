import { processImageFastPath } from '../adapters/browser/fastPath.js';
import { processImageHeavyPath } from '../adapters/browser/heavyPath.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, options, isFastPath } = event.data;

  try {
    let resultBuffer: ArrayBuffer;
    
    if (isFastPath) {
      resultBuffer = await processImageFastPath(buffer, options);
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
