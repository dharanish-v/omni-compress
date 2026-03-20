import { processAudioFastPath } from '../adapters/browser/fastPath.js';
import { processAudioHeavyPath } from '../adapters/browser/heavyPath.js';

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, options, isFastPath } = event.data;

  // Since workers run in a separate context, we can't easily use the global logger instance directly
  // without importing it and relying on default levels, but for internal worker logging, console is standard.
  console.debug(`[OmniCompress:Worker:Audio] Starting task ${id}. FastPath: ${isFastPath}`);

  try {
    let resultBuffer: ArrayBuffer;
    
    if (isFastPath) {
      console.debug(`[OmniCompress:Worker:Audio] Executing Fast Path`);
      resultBuffer = await processAudioFastPath(buffer, options);
    } else {
      console.debug(`[OmniCompress:Worker:Audio] Executing Heavy Path (FFmpeg)`);
      resultBuffer = await processAudioHeavyPath(buffer, options, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
    }

    console.debug(`[OmniCompress:Worker:Audio] Task ${id} complete. Transferring buffer back.`);
    // Zero-Copy Memory Transfer back to main thread
    self.postMessage({ id, type: 'success', buffer: resultBuffer }, { transfer: [resultBuffer] });
  } catch (error: any) {
    console.error(`[OmniCompress:Worker:Audio] Error in task ${id}:`, error);
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
