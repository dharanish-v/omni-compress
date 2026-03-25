import { FileTooLargeError } from './errors.js';

export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

export function getMimeType(type: 'image' | 'audio', format: string): string {
  if (type === 'image') {
    if (format === 'jpg') return 'image/jpeg';
    return `image/${format}`;
  } else {
    return `audio/${format}`;
  }
}

/**
 * Default safe processing limits per environment.
 * Browser Wasm has ~1–4 GB linear memory; we set a conservative limit.
 * Node uses native ffmpeg with no Wasm memory constraint.
 */
export const SAFE_SIZE_LIMITS = {
  browser: 250 * 1024 * 1024, // 250 MB
  node: Infinity,
} as const;

/**
 * Throws FileTooLargeError if the file exceeds the safe limit for the given environment.
 */
export function assertFileSizeWithinLimit(
  fileSize: number,
  env: 'browser' | 'node',
): void {
  const maxSize = SAFE_SIZE_LIMITS[env];
  if (fileSize > maxSize) {
    throw new FileTooLargeError(fileSize, maxSize);
  }
}
