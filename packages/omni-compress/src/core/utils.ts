import { FileTooLargeError } from './errors.js';

/**
 * Reads a `File` or `Blob` into an `ArrayBuffer`.
 * Used internally before dispatching to the fast path, AVIF encoder, or FFmpeg.
 *
 * @param file - The file or blob to read.
 * @returns A promise that resolves to the file's raw bytes.
 */
export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

/**
 * Wraps a raw `ArrayBuffer` into a `Blob` with the given MIME type.
 * Used to convert FFmpeg/OffscreenCanvas output back into a transferable blob.
 *
 * @param buffer - The raw bytes to wrap.
 * @param mimeType - MIME type for the resulting blob (e.g. `'image/webp'`).
 * @returns A `Blob` containing the given bytes.
 */
export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

/**
 * Maps a media type + format string to the canonical MIME type string.
 * Handles special cases: `jpg` → `image/jpeg`, `opus` → `audio/ogg`.
 *
 * @param type - The media category: `'image'`, `'audio'`, or `'video'`.
 * @param format - The target format (e.g. `'webp'`, `'opus'`, `'mp4'`).
 * @returns The MIME type string (e.g. `'image/webp'`, `'audio/ogg'`).
 */
export function getMimeType(type: 'image' | 'audio' | 'video', format: string): string {
  if (type === 'image') {
    if (format === 'jpg') return 'image/jpeg';
    return `image/${format}`;
  } else if (type === 'audio') {
    if (format === 'opus') return 'audio/ogg'; // Common container for Opus
    return `audio/${format}`;
  } else {
    if (format === 'mp4') return 'video/mp4';
    if (format === 'webm') return 'video/webm';
    return `video/${format}`;
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
export function assertFileSizeWithinLimit(fileSize: number, env: 'browser' | 'node'): void {
  const maxSize = SAFE_SIZE_LIMITS[env];
  if (fileSize > maxSize) {
    throw new FileTooLargeError(fileSize, maxSize);
  }
}

/**
 * Checks if a file is an image based on its MIME type or extension.
 */
export function isImageFile(f: File | Blob): boolean {
  if (f.type) return f.type.startsWith('image/');
  if ('name' in f) {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'tiff'].includes(ext || '');
  }
  return false;
}

/**
 * Checks if a file is an audio file based on its MIME type or extension.
 */
export function isAudioFile(f: File | Blob): boolean {
  if (f.type) return f.type.startsWith('audio/');
  if ('name' in f) {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ['mp3', 'opus', 'ogg', 'wav', 'flac', 'aac', 'm4a'].includes(ext || '');
  }
  return false;
}

/**
 * Zero-decode image dimension parser.
 * Reads width/height from raw file header bytes (~1µs, no GPU involvement).
 * Supports JPEG (SOF0/SOF1/SOF2), PNG (IHDR), and WebP (VP8/VP8L/VP8X).
 * Returns null for unknown formats — caller falls back to probe decode.
 */
export function getImageDimensionsFromHeader(
  buffer: ArrayBuffer,
): { width: number; height: number } | null {
  const view = new DataView(buffer);
  const len = buffer.byteLength;

  // PNG: signature 0x89504E47 at byte 0; IHDR width/height at bytes 16–23
  if (len >= 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: starts with FF D8; scan for SOF0 (FFC0), SOF1 (FFC1), SOF2 (FFC2)
  if (len >= 4 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
    let offset = 2;
    while (offset + 8 < len) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      if (offset + 3 >= len) break;
      const segLen = view.getUint16(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF????WEBP at bytes 0–11
  if (len >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunkType = String.fromCharCode(
      view.getUint8(12),
      view.getUint8(13),
      view.getUint8(14),
      view.getUint8(15),
    );
    if (chunkType === 'VP8 ' && len >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L' && len >= 25) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunkType === 'VP8X' && len >= 34) {
      const w = (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1;
      const h = (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1;
      return { width: w, height: h };
    }
  }

  return null;
}

/**
 * Checks if a file is a video file based on its MIME type or extension.
 */
export function isVideoFile(f: File | Blob): boolean {
  if (f.type) return f.type.startsWith('video/');
  if ('name' in f) {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext || '');
  }
  return false;
}

/**
 * Detects the media format of a file from its magic bytes (file signature).
 *
 * Returns a lowercase format string (e.g. `'webp'`, `'mp3'`) or `null` if
 * the signature is not recognised. Requires at least 12 bytes.
 *
 * Use this to validate that a file's actual content matches its extension,
 * or to detect the format when the extension is missing or untrusted.
 *
 * Supported: jpeg, png, gif, webp, avif, mp3, wav, flac, ogg, aac
 *
 * @example
 * ```ts
 * const buffer = await file.arrayBuffer();
 * const format = detectFormat(buffer); // e.g. 'webp'
 * ```
 */
export function detectFormat(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 12) return null;

  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'gif';
  }

  // RIFF-based: WebP and WAV share the RIFF header — distinguish by bytes 8-11
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    // WebP: RIFF????WEBP
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'webp';
    }
    // WAV: RIFF????WAVE
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return 'wav';
    }
  }

  // AVIF / HEIC: ftyp box — bytes 4-7 are 'ftyp', brand at bytes 8-11
  // Common AVIF brands: 'avif', 'avis', 'MA1B', 'MA1A'
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'MA1B' || brand === 'MA1A') {
      return 'avif';
    }
  }

  // FLAC: 66 4C 61 43 (fLaC)
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'flac';
  }

  // OGG: 4F 67 67 53 (OggS)
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'ogg';
  }

  // MP3 with ID3 tag: 49 44 33 (ID3)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3';
  }
  // MP3 sync frame without ID3: FF FB, FF FA, FF F3, FF F2
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0x00) {
    return 'mp3';
  }

  // AAC ADTS sync word: FF F1 or FF F9
  if (bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) {
    return 'aac';
  }

  return null;
}
