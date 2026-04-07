import { compressImage } from '../index.js';
import { type ImageOptions } from '../core/router.js';

export interface CompressorOptions extends Omit<ImageOptions, 'format'> {
  /**
   * Output mime type (e.g., 'image/webp', 'image/jpeg')
   * @default 'image/jpeg'
   */
  mimeType?: string;
  /**
   * Success callback (called with compressed Blob or File)
   */
  success?: (result: Blob | File) => void;
  /**
   * Error callback (called with Error object)
   */
  error?: (err: Error) => void;
  /**
   * If the compressed image is larger than the original, output the original.
   * @default true
   */
  strict?: boolean;
  /**
   * Files larger than this (in bytes) will be converted to JPEGs.
   * @default 5,000,000 (5 MB)
   */
  convertSize?: number;
}

/**
 * Compatibility shim for `compressorjs`.
 * 
 * Provides an API identical to the `Compressor` class from the `compressorjs` package,
 * but uses `omni-compress` under the hood to support AVIF and faster Web Workers.
 * 
 * @example
 * ```ts
 * import Compressor from 'omni-compress/compat';
 * 
 * new Compressor(file, {
 *   quality: 0.6,
 *   success(result) {
 *     // 'result' is the compressed Blob/File
 *   },
 *   error(err) {
 *     console.error(err.message);
 *   },
 * });
 * ```
 */
export default class Compressor {
  constructor(file: File | Blob, options: CompressorOptions = {}) {
    this.compress(file, options);
  }

  private async compress(file: File | Blob, options: CompressorOptions) {
    const {
      success,
      error,
      strict = true,
      convertSize = 5_000_000,
      mimeType = 'image/jpeg',
      ...rest
    } = options;

    try {
      let targetFormat = mimeType.replace('image/', '');
      if (targetFormat === 'jpg') targetFormat = 'jpeg';
      
      // Handle convertSize (compressorjs feature)
      if (file.size > convertSize && targetFormat !== 'jpeg') {
        targetFormat = 'jpeg';
      }

      const result = await compressImage(file, {
        ...rest,
        format: targetFormat as any,
      });

      // Handle strict mode (compressorjs feature):
      // If the compressed image is larger than the original, output the original.
      if (strict && result.compressedSize >= result.originalSize) {
        success?.(file);
      } else {
        success?.(result.blob);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (error) {
        error(errorObj);
      } else {
        // Surface the error to console if no callback provided to avoid silent failure
        console.error('[OmniCompress:Compat] Compression failed:', errorObj);
      }
    }
  }
}
