import type { LocalImageService, ImageTransform } from 'astro';
import { compressImage } from 'omni-compress';

export interface OmniCompressServiceOptions {
  /** Default output format. Default: 'webp' */
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  /** Default quality 0–1. Default: 0.8 */
  quality?: number;
}

/**
 * Astro local image service powered by omni-compress.
 *
 * Drop-in alternative to sharp that works in environments where
 * sharp's native binaries cannot install (Docker, serverless, edge).
 *
 * Usage in astro.config.mjs:
 * ```js
 * import { omniCompressService } from 'astro-omni-compress';
 * export default defineConfig({
 *   image: { service: omniCompressService({ quality: 0.8 }) }
 * });
 * ```
 */
export function omniCompressService(options: OmniCompressServiceOptions = {}): LocalImageService {
  const defaultFormat = options.format ?? 'webp';
  const defaultQuality = options.quality ?? 0.8;

  return {
    getURL(options: ImageTransform, imageConfig: { service: { entrypoint: string } }) {
      // Build a URL with transform params encoded as query string
      // Astro calls this to generate the <img src> URL
      const params = new URLSearchParams();
      if (options.width) params.set('w', String(options.width));
      if (options.height) params.set('h', String(options.height));
      if (options.quality) params.set('q', String(options.quality));
      if (options.format) params.set('f', options.format);
      const src = typeof options.src === 'string' ? options.src : (options.src as { src: string }).src;
      return `/_image?${params.toString()}&href=${encodeURIComponent(src)}`;
    },

    parseURL(url: URL) {
      return {
        src: decodeURIComponent(url.searchParams.get('href') ?? ''),
        width: url.searchParams.has('w') ? Number(url.searchParams.get('w')) : undefined,
        height: url.searchParams.has('h') ? Number(url.searchParams.get('h')) : undefined,
        quality: url.searchParams.has('q') ? Number(url.searchParams.get('q')) : undefined,
        format: (url.searchParams.get('f') ?? defaultFormat) as ImageTransform['format'],
      };
    },

    async transform(inputBuffer: Uint8Array, transform: ImageTransform): Promise<{ data: Uint8Array; format: string }> {
      const blob = new Blob([inputBuffer]);
      const quality = typeof transform.quality === 'number' ? transform.quality / 100 : defaultQuality;

      const result = await compressImage(blob as File, {
        format: (transform.format as 'webp' | 'jpeg' | 'png' | 'avif') ?? defaultFormat,
        quality,
        maxWidth: transform.width,
        maxHeight: transform.height,
        strict: true,
      });

      const outputBuffer = new Uint8Array(await result.blob.arrayBuffer());
      return { data: outputBuffer, format: result.format };
    },
  };
}

export default omniCompressService;
