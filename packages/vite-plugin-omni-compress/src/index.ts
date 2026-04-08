import type { Plugin } from 'vite';
import { compressImage, compressAudio } from 'omni-compress';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface OmniCompressImageOptions {
  /** Output format. Default: 'webp' */
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  /** Quality 0–1. Default: 0.8 */
  quality?: number;
  /** Max width in pixels */
  maxWidth?: number;
  /** Max height in pixels */
  maxHeight?: number;
  /** Return original if compressed is larger. Default: true */
  strict?: boolean;
}

export interface OmniCompressAudioOptions {
  /** Output format. Default: 'opus' */
  format?: 'opus' | 'mp3' | 'aac' | 'flac';
  /** Bitrate string e.g. '96k'. Default: '96k' */
  bitrate?: string;
}

export interface OmniCompressOptions {
  /** Image compression options. Set to false to disable. */
  images?: OmniCompressImageOptions | false;
  /** Audio compression options. Set to false to disable. */
  audio?: OmniCompressAudioOptions | false;
  /**
   * Glob patterns of files to include.
   * Default: ['**\/*.{png,jpg,jpeg,gif}'] for images, ['**\/*.{wav,mp3,ogg,flac}'] for audio
   */
  include?: string[];
  /**
   * Glob patterns of files to exclude.
   * Default: []
   */
  exclude?: string[];
  /** Log compression results to the console. Default: true */
  verbose?: boolean;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tiff', '.bmp', '.heic', '.heif']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a']);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesPatterns(filePath: string, patterns: string[]): boolean {
  const { minimatch } = require('minimatch');
  return patterns.some((pattern) => minimatch(filePath, pattern, { matchBase: true }));
}

export function omniCompress(options: OmniCompressOptions = {}): Plugin {
  const {
    images = { format: 'webp', quality: 0.8, strict: true },
    audio = { format: 'opus', bitrate: '96k' },
    exclude = [],
    verbose = true,
  } = options;

  let outDir = 'dist';

  return {
    name: 'vite-plugin-omni-compress',
    apply: 'build',

    configResolved(config) {
      outDir = config.build.outDir ?? 'dist';
    },

    async closeBundle() {
      const { glob } = await import('glob');

      const imagePatternsToProcess = options.include
        ? options.include.filter((p) => /\.(png|jpe?g|gif|webp|tiff?|bmp|heic|heif)$/i.test(p))
        : ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.tiff', '**/*.bmp', '**/*.heic', '**/*.heif'];

      const audioPatternsToProcess = options.include
        ? options.include.filter((p) => /\.(wav|mp3|ogg|flac|aac|m4a)$/i.test(p))
        : ['**/*.wav', '**/*.mp3', '**/*.ogg', '**/*.flac', '**/*.aac', '**/*.m4a'];

      const results: Array<{ file: string; originalSize: number; compressedSize: number; format: string }> = [];

      // Process images
      if (images !== false) {
        const imageOpts = images as OmniCompressImageOptions;
        const imageFiles = await glob(imagePatternsToProcess, {
          cwd: outDir,
          absolute: true,
          ignore: exclude,
        });

        for (const filePath of imageFiles) {
          if (!existsSync(filePath)) continue;
          const ext = path.extname(filePath).toLowerCase();
          if (!IMAGE_EXTENSIONS.has(ext)) continue;

          try {
            const originalBuffer = await readFile(filePath);
            const originalSize = originalBuffer.byteLength;
            const blob = new Blob([originalBuffer]);

            const result = await compressImage(blob as File, {
              format: imageOpts.format ?? 'webp',
              quality: imageOpts.quality ?? 0.8,
              maxWidth: imageOpts.maxWidth,
              maxHeight: imageOpts.maxHeight,
              strict: imageOpts.strict ?? true,
            });

            const compressedBuffer = Buffer.from(await result.blob.arrayBuffer());
            const compressedSize = compressedBuffer.byteLength;

            if (compressedSize < originalSize) {
              const outputExt = `.${result.format}`;
              const outputPath = filePath.replace(/\.[^.]+$/, outputExt);
              await writeFile(outputPath, compressedBuffer);
              // Remove original if extension changed
              if (outputPath !== filePath) {
                const { unlink } = await import('node:fs/promises');
                await unlink(filePath).catch(() => {});
              }
              results.push({ file: path.relative(outDir, outputPath), originalSize, compressedSize, format: result.format });
            }
          } catch (_e) {
            // Skip files that fail to compress (e.g., animated GIFs, corrupt files)
          }
        }
      }

      // Process audio
      if (audio !== false) {
        const audioOpts = audio as OmniCompressAudioOptions;
        const audioFiles = await glob(audioPatternsToProcess, {
          cwd: outDir,
          absolute: true,
          ignore: exclude,
        });

        for (const filePath of audioFiles) {
          if (!existsSync(filePath)) continue;
          const ext = path.extname(filePath).toLowerCase();
          if (!AUDIO_EXTENSIONS.has(ext)) continue;

          try {
            const originalBuffer = await readFile(filePath);
            const originalSize = originalBuffer.byteLength;
            const blob = new Blob([originalBuffer]);

            const result = await compressAudio(blob as File, {
              format: audioOpts.format ?? 'opus',
              bitrate: audioOpts.bitrate ?? '96k',
            });

            const compressedBuffer = Buffer.from(await result.blob.arrayBuffer());
            const compressedSize = compressedBuffer.byteLength;

            if (compressedSize < originalSize) {
              const outputExt = result.format === 'opus' ? '.ogg' : `.${result.format}`;
              const outputPath = filePath.replace(/\.[^.]+$/, outputExt);
              await writeFile(outputPath, compressedBuffer);
              if (outputPath !== filePath) {
                const { unlink } = await import('node:fs/promises');
                await unlink(filePath).catch(() => {});
              }
              results.push({ file: path.relative(outDir, outputPath), originalSize, compressedSize, format: result.format });
            }
          } catch (_e) {
            // Skip files that fail
          }
        }
      }

      // Report results
      if (verbose && results.length > 0) {
        const totalOriginal = results.reduce((s, r) => s + r.originalSize, 0);
        const totalCompressed = results.reduce((s, r) => s + r.compressedSize, 0);
        const savedBytes = totalOriginal - totalCompressed;
        const savedPercent = Math.round((savedBytes / totalOriginal) * 100);

        console.log('\n[vite-plugin-omni-compress]');
        for (const r of results) {
          const saved = Math.round(((r.originalSize - r.compressedSize) / r.originalSize) * 100);
          console.log(`  ${r.file} — ${formatBytes(r.originalSize)} → ${formatBytes(r.compressedSize)} (-${saved}%) [${r.format}]`);
        }
        console.log(`  Total: ${formatBytes(savedBytes)} saved (-${savedPercent}%) across ${results.length} files\n`);
      }
    },
  };
}

export default omniCompress;
