import { zip, Zip, ZipDeflate } from 'fflate';
import type { FlateError, AsyncZipOptions, DeflateOptions } from 'fflate';
import type { ArchiveEntry, ArchiveOptions, ArchiveResult } from './core/router.js';
import { AbortError, EncoderError } from './core/errors.js';
import { _compress } from './core/processor.js';
import { isImageFile, isAudioFile } from './core/utils.js';

/**
 * Compresses an array of files into a ZIP archive.
 *
 * Works identically in browser and Node.js (fflate is isomorphic).
 * Uses fflate's async `zip()` — non-blocking, runs in the current thread.
 *
 * @example
 * ```ts
 * const result = await archive([
 *   { name: 'photo.webp', data: compressedBlob },
 *   { name: 'audio.opus', data: audioBlob },
 * ], { smartOptimize: true });
 * ```
 */
export async function archive(
  entries: ArchiveEntry[],
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  if (options.signal?.aborted) throw new AbortError('Archive aborted');

  const files: Record<string, [Uint8Array, AsyncZipOptions]> = {};
  let originalSize = 0;
  const total = entries.length;
  const level = (options.level ?? 6) as AsyncZipOptions['level'];

  // Track per-entry progress for smooth aggregate reporting (0-50% = media compress, 50-100% = zip)
  const entryProgress = new Array<number>(total).fill(0);
  const reportProgress = () => {
    if (!options.onProgress) return;
    const avg = entryProgress.reduce((a, b) => a + b, 0) / total;
    options.onProgress(Math.round(avg * 0.5)); // first 50% = media phase
  };

  // Process all entries in parallel — fast path (OffscreenCanvas/WebCodecs) and Node.js
  // native ffmpeg both support concurrency. The worker pool serialises Wasm jobs internally.
  const processed = await Promise.all(
    entries.map(async (entry, i) => {
      if (options.signal?.aborted) throw new AbortError('Archive aborted');

      let data: Uint8Array;
      let entryName = entry.name;

      const entryData =
        entry.data instanceof Uint8Array
          ? new Blob([entry.data.buffer as ArrayBuffer])
          : entry.data;

      const entrySize = entryData.size;

      if (options.smartOptimize && (isImageFile(entryData) || isAudioFile(entryData))) {
        const isImage = isImageFile(entryData);

        const updateEntryProgress = (p: number) => {
          entryProgress[i] = p;
          reportProgress();
        };

        const resultBlob = isImage
          ? await _compress(
              entryData,
              {
                type: 'image',
                format: (entryData as File).type === 'image/webp' ? 'avif' : 'webp',
                quality: 0.8,
                onProgress: updateEntryProgress,
              },
              options.signal,
            )
          : await _compress(
              entryData,
              {
                type: 'audio',
                format:
                  (entryData as File).type === 'audio/mpeg' ||
                  (entryData as File).type === 'audio/mp3'
                    ? 'opus'
                    : 'mp3',
                bitrate: '128k',
                onProgress: updateEntryProgress,
              },
              options.signal,
            );

        data = new Uint8Array(await resultBlob.arrayBuffer());
        entryProgress[i] = 100;
        reportProgress();

        const format = isImage
          ? (entryData as File).type === 'image/webp'
            ? 'avif'
            : 'webp'
          : (entryData as File).type === 'audio/mpeg' || (entryData as File).type === 'audio/mp3'
            ? 'opus'
            : 'mp3';

        const parts = entryName.split('.');
        if (parts.length > 1) {
          parts.pop();
          entryName = parts.join('.') + '.' + format;
        } else {
          entryName = entryName + '.' + format;
        }
      } else {
        data = new Uint8Array(await entryData.arrayBuffer());
        entryProgress[i] = 100;
        reportProgress();
      }

      return { entryName, data, entrySize };
    }),
  );

  for (const { entryName, data, entrySize } of processed) {
    originalSize += entrySize;
    files[entryName] = [data, { level }];
  }

  if (options.signal?.aborted) throw new AbortError('Archive aborted');

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    const onAbort = () => reject(new AbortError('Archive aborted'));
    options.signal?.addEventListener('abort', onAbort, { once: true });

    zip(files, (err: FlateError | null, data: Uint8Array) => {
      options.signal?.removeEventListener('abort', onAbort);
      if (err) {
        reject(new EncoderError('ZIP compression failed', err));
      } else {
        resolve(data);
      }
    });
  });

  options.onProgress?.(100);

  const zipBuffer = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([zipBuffer], { type: 'application/zip' });

  return {
    blob,
    originalSize,
    compressedSize: zipped.byteLength,
    ratio: originalSize > 0 ? zipped.byteLength / originalSize : 1,
    format: 'zip',
  };
}

/**
 * Returns a streaming ZIP archive as a `ReadableStream<Uint8Array>`.
 *
 * Prefer `archive()` for small archives. Use this for large archives where
 * you want to start streaming output before all entries are fully read.
 */
export function archiveStream(
  entries: ArchiveEntry[],
  options: ArchiveOptions = {},
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (options.signal?.aborted) {
          controller.error(new AbortError('Archive stream aborted'));
          return;
        }

        const level = (options.level ?? 6) as DeflateOptions['level'];

        const zipInstance = new Zip((err: FlateError | null, chunk: Uint8Array, final: boolean) => {
          if (err) {
            controller.error(new EncoderError('ZIP stream compression failed', err));
            return;
          }
          controller.enqueue(chunk);
          if (final) controller.close();
        });

        const total = entries.length;
        for (let i = 0; i < total; i++) {
          if (options.signal?.aborted) {
            zipInstance.end(); // close fflate zip
            controller.error(new AbortError('Archive stream aborted'));
            return;
          }

          const entry = entries[i];
          let entryName = entry.name;
          const entryData =
            entry.data instanceof Uint8Array
              ? new Blob([entry.data.buffer as ArrayBuffer])
              : entry.data;

          let data: Uint8Array;

          if (options.smartOptimize && (isImageFile(entryData) || isAudioFile(entryData))) {
            const isImage = isImageFile(entryData);

            const updateEntryProgress = (p: number) => {
              const baseProgress = (i / total) * 100;
              const itemProgress = (p / 100) * (100 / total);
              options.onProgress?.(Math.round(baseProgress + itemProgress));
            };

            const resultBlob = isImage
              ? await _compress(
                  entryData,
                  {
                    type: 'image',
                    format: (entryData as File).type === 'image/webp' ? 'avif' : 'webp',
                    quality: 0.8,
                    onProgress: updateEntryProgress,
                  },
                  options.signal,
                )
              : await _compress(
                  entryData,
                  {
                    type: 'audio',
                    format:
                      (entryData as File).type === 'audio/mpeg' ||
                      (entryData as File).type === 'audio/mp3'
                        ? 'opus'
                        : 'mp3',
                    bitrate: '128k',
                    onProgress: updateEntryProgress,
                  },
                  options.signal,
                );

            data = new Uint8Array(await resultBlob.arrayBuffer());

            const format = isImage
              ? (entryData as File).type === 'image/webp'
                ? 'avif'
                : 'webp'
              : (entryData as File).type === 'audio/mpeg' ||
                  (entryData as File).type === 'audio/mp3'
                ? 'opus'
                : 'mp3';

            const parts = entryName.split('.');
            if (parts.length > 1) {
              parts.pop();
              entryName = parts.join('.') + '.' + format;
            } else {
              entryName = entryName + '.' + format;
            }
          } else {
            data = new Uint8Array(await entryData.arrayBuffer());
            options.onProgress?.(Math.round(((i + 1) / total) * 100));
          }

          const file = new ZipDeflate(entryName, { level });
          zipInstance.add(file);
          file.push(data, true);
        }

        zipInstance.end();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
