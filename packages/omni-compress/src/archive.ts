import { zip, Zip, ZipDeflate } from 'fflate';
import type { FlateError, AsyncZipOptions, DeflateOptions } from 'fflate';
import type { ArchiveEntry, ArchiveOptions, ArchiveResult } from './core/router.js';
import { AbortError, EncoderError } from './core/errors.js';

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
 * ]);
 * // result.blob → save or upload the ZIP
 * // result.ratio → e.g. 0.73 means 27% smaller
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

  for (let i = 0; i < total; i++) {
    if (options.signal?.aborted) throw new AbortError('Archive aborted');

    const entry = entries[i];
    let data: Uint8Array;

    if (entry.data instanceof Uint8Array) {
      data = entry.data;
    } else {
      data = new Uint8Array(await entry.data.arrayBuffer());
    }

    originalSize += data.byteLength;
    files[entry.name] = [data, { level }];

    // Emit entry-read progress (0–50%); fflate handles the rest
    options.onProgress?.(Math.round(((i + 1) / total) * 50));
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

  // Cast is safe: fflate never uses SharedArrayBuffer as its backing buffer
  const zipBuffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
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
 *
 * @example
 * ```ts
 * const stream = archiveStream(entries);
 * const response = new Response(stream, { headers: { 'Content-Type': 'application/zip' } });
 * ```
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

        // fflate's Zip streams compressed chunks via a callback as files are added.
        // Callback signature: (err: FlateError | null, data: Uint8Array, final: boolean)
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
            controller.error(new AbortError('Archive stream aborted'));
            return;
          }

          const entry = entries[i];
          let data: Uint8Array;

          if (entry.data instanceof Uint8Array) {
            data = entry.data;
          } else {
            data = new Uint8Array(await entry.data.arrayBuffer());
          }

          const file = new ZipDeflate(entry.name, { level });
          zipInstance.add(file);
          file.push(data, true); // true = final chunk for this file

          options.onProgress?.(Math.round(((i + 1) / total) * 100));
        }

        zipInstance.end();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
