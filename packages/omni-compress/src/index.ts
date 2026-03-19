import { Router, CompressorOptions } from './core/router.js';
import { fileToArrayBuffer, arrayBufferToBlob, getMimeType } from './core/utils.js';
import { processWithBrowserWorker } from './adapters/browser/workerPool.js';
import { logger } from './core/logger.js';

// Dynamically imported to avoid breaking browser environments
let processWithNode: any = null;

export class OmniCompressor {
  /**
   * Processes a media file (Image or Audio) using the optimal available engine.
   * 
   * @param file The input File or Blob.
   * @param options Configuration for compression.
   * @returns A Promise resolving to the compressed Blob.
   */
  static async process(file: File | Blob, options: CompressorOptions): Promise<Blob> {
    logger.info('Starting compression process', { type: options.type, format: options.format });
    const route = Router.evaluate(options);
    logger.debug('Route evaluated', route);
    const mimeType = getMimeType(options.type, options.format);
    
    // Set the original filename if it's a File object, to help FFmpeg probe formats correctly
    if ('name' in file) {
      options.originalFileName = (file as File).name;
      logger.debug(`Extracted original filename: ${options.originalFileName}`);
    }

    options.onProgress?.(0);

    if (route.env === 'node') {
      logger.info('Executing via Node.js native adapter');
      // PHASE 5 Implementation
      if (!processWithNode) {
        logger.debug('Dynamically loading Node child_process adapter');
        // Dynamically import the Node adapter only when in Node environment
        // This ensures Webpack/Vite don't crash trying to polyfill 'node:child_process'
        const adapter = await import('./adapters/node/childProcess.js');
        processWithNode = adapter.processWithNode;
      }
      const result = await processWithNode(file, options);
      logger.info('Node processing complete');
      options.onProgress?.(100);
      return result;
    } else {
      logger.info(`Executing via Browser Worker pool. Fast path: ${route.isFastPath}`);
      // Browser Environment
      logger.debug('Converting File/Blob to ArrayBuffer');
      const buffer = await fileToArrayBuffer(file);
      
      // Zero-copy transfer to worker and back
      logger.debug('Dispatching task to worker pool');
      const processedBuffer = await processWithBrowserWorker(buffer, options, route.isFastPath);
      
      logger.info('Browser processing complete');
      options.onProgress?.(100);
      return arrayBufferToBlob(processedBuffer, mimeType);
    }
  }

  /**
   * Configure the global logging level
   */
  static setLogLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    logger.setLevel(level);
  }
}

export * from './core/router.js';
export * from './core/utils.js';
export * from './core/logger.js';

