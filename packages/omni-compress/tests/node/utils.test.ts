import { describe, it, expect } from 'vitest';
import {
  fileToArrayBuffer,
  arrayBufferToBlob,
  getMimeType,
  assertFileSizeWithinLimit,
  isImageFile,
  isAudioFile,
  isVideoFile,
  detectFormat,
  getImageDimensionsFromHeader,
  SAFE_SIZE_LIMITS,
} from '../../src/core/utils';
import { FileTooLargeError } from '../../src/core/errors';

// ---------------------------------------------------------------------------
// fileToArrayBuffer
// ---------------------------------------------------------------------------
describe('fileToArrayBuffer', () => {
  it('converts a Blob to ArrayBuffer', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const buf = await fileToArrayBuffer(blob);
    expect(buf.byteLength).toBe(3);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

// ---------------------------------------------------------------------------
// arrayBufferToBlob
// ---------------------------------------------------------------------------
describe('arrayBufferToBlob', () => {
  it('wraps buffer in Blob with given MIME type', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    const blob = arrayBufferToBlob(buf, 'image/jpeg');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getMimeType
// ---------------------------------------------------------------------------
describe('getMimeType', () => {
  it('returns image/jpeg for jpg', () => {
    expect(getMimeType('image', 'jpg')).toBe('image/jpeg');
  });

  it('returns image/<format> for other image formats', () => {
    expect(getMimeType('image', 'webp')).toBe('image/webp');
    expect(getMimeType('image', 'avif')).toBe('image/avif');
    expect(getMimeType('image', 'png')).toBe('image/png');
  });

  it('returns audio/ogg for opus', () => {
    expect(getMimeType('audio', 'opus')).toBe('audio/ogg');
  });

  it('returns audio/<format> for other audio formats', () => {
    expect(getMimeType('audio', 'mp3')).toBe('audio/mp3');
    expect(getMimeType('audio', 'flac')).toBe('audio/flac');
    expect(getMimeType('audio', 'wav')).toBe('audio/wav');
  });

  it('returns video/mp4 for mp4', () => {
    expect(getMimeType('video', 'mp4')).toBe('video/mp4');
  });

  it('returns video/webm for webm', () => {
    expect(getMimeType('video', 'webm')).toBe('video/webm');
  });

  it('returns video/<format> for unknown video', () => {
    expect(getMimeType('video', 'mov')).toBe('video/mov');
  });
});

// ---------------------------------------------------------------------------
// assertFileSizeWithinLimit
// ---------------------------------------------------------------------------
describe('assertFileSizeWithinLimit', () => {
  it('does not throw when file is within browser limit', () => {
    expect(() => assertFileSizeWithinLimit(1024, 'browser')).not.toThrow();
  });

  it('throws FileTooLargeError when file exceeds browser limit', () => {
    const overLimit = SAFE_SIZE_LIMITS.browser + 1;
    expect(() => assertFileSizeWithinLimit(overLimit, 'browser')).toThrow(FileTooLargeError);
  });

  it('never throws in node (Infinity limit)', () => {
    expect(() => assertFileSizeWithinLimit(Number.MAX_SAFE_INTEGER, 'node')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isImageFile
// ---------------------------------------------------------------------------
describe('isImageFile', () => {
  it('returns true for image/* MIME types', () => {
    expect(isImageFile(new Blob([], { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new Blob([], { type: 'image/jpeg' }))).toBe(true);
    expect(isImageFile(new Blob([], { type: 'image/webp' }))).toBe(true);
  });

  it('returns false for non-image MIME types', () => {
    expect(isImageFile(new Blob([], { type: 'audio/mp3' }))).toBe(false);
    expect(isImageFile(new Blob([], { type: 'video/mp4' }))).toBe(false);
  });

  it('returns true for image extensions on File', () => {
    expect(isImageFile(new File([], 'photo.jpg'))).toBe(true);
    expect(isImageFile(new File([], 'image.avif'))).toBe(true);
    expect(isImageFile(new File([], 'icon.png'))).toBe(true);
  });

  it('returns false for non-image extensions', () => {
    expect(isImageFile(new File([], 'audio.mp3'))).toBe(false);
    expect(isImageFile(new File([], 'video.mp4'))).toBe(false);
  });

  it('returns false when type is empty and no name', () => {
    expect(isImageFile(new Blob([]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAudioFile
// ---------------------------------------------------------------------------
describe('isAudioFile', () => {
  it('returns true for audio/* MIME types', () => {
    expect(isAudioFile(new Blob([], { type: 'audio/mp3' }))).toBe(true);
    expect(isAudioFile(new Blob([], { type: 'audio/wav' }))).toBe(true);
  });

  it('returns false for non-audio MIME types', () => {
    expect(isAudioFile(new Blob([], { type: 'image/png' }))).toBe(false);
  });

  it('returns true for audio extensions', () => {
    expect(isAudioFile(new File([], 'song.mp3'))).toBe(true);
    expect(isAudioFile(new File([], 'track.flac'))).toBe(true);
    expect(isAudioFile(new File([], 'podcast.opus'))).toBe(true);
  });

  it('returns false for non-audio extensions', () => {
    expect(isAudioFile(new File([], 'photo.jpg'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isVideoFile
// ---------------------------------------------------------------------------
describe('isVideoFile', () => {
  it('returns true for video/* MIME types', () => {
    expect(isVideoFile(new Blob([], { type: 'video/mp4' }))).toBe(true);
    expect(isVideoFile(new Blob([], { type: 'video/webm' }))).toBe(true);
  });

  it('returns false for non-video MIME types', () => {
    expect(isVideoFile(new Blob([], { type: 'image/png' }))).toBe(false);
  });

  it('returns true for video extensions', () => {
    expect(isVideoFile(new File([], 'clip.mp4'))).toBe(true);
    expect(isVideoFile(new File([], 'video.webm'))).toBe(true);
    expect(isVideoFile(new File([], 'movie.mkv'))).toBe(true);
  });

  it('returns false for non-video extensions', () => {
    expect(isVideoFile(new File([], 'song.mp3'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectFormat — magic byte detection
// ---------------------------------------------------------------------------
describe('detectFormat', () => {
  function makeBuffer(bytes: number[]): ArrayBuffer {
    return new Uint8Array(bytes.concat(new Array(Math.max(0, 16 - bytes.length)).fill(0))).buffer;
  }

  it('returns null for buffers shorter than 12 bytes', () => {
    expect(detectFormat(new Uint8Array(8).buffer)).toBeNull();
  });

  it('detects JPEG', () => {
    const buf = makeBuffer([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectFormat(buf)).toBe('jpeg');
  });

  it('detects PNG', () => {
    const buf = makeBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectFormat(buf)).toBe('png');
  });

  it('detects GIF', () => {
    const buf = makeBuffer([0x47, 0x49, 0x46, 0x38]);
    expect(detectFormat(buf)).toBe('gif');
  });

  it('detects WebP (RIFF container)', () => {
    // RIFF????WEBP
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(detectFormat(new Uint8Array(bytes).buffer)).toBe('webp');
  });

  it('detects WAV (RIFF container)', () => {
    // RIFF????WAVE
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    expect(detectFormat(new Uint8Array(bytes).buffer)).toBe('wav');
  });

  it('detects AVIF (ftyp box with avif brand)', () => {
    // bytes 4-7: ftyp, bytes 8-11: avif
    const bytes = [0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0];
    expect(detectFormat(new Uint8Array(bytes).buffer)).toBe('avif');
  });

  it('returns null for ftyp box with non-AVIF brand', () => {
    // bytes 4-7: ftyp, bytes 8-11: mp42 (MP4, not AVIF)
    const bytes = [0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0];
    expect(detectFormat(new Uint8Array(bytes).buffer)).toBeNull();
  });

  it('detects FLAC', () => {
    const buf = makeBuffer([0x66, 0x4c, 0x61, 0x43]);
    expect(detectFormat(buf)).toBe('flac');
  });

  it('detects OGG', () => {
    const buf = makeBuffer([0x4f, 0x67, 0x67, 0x53]);
    expect(detectFormat(buf)).toBe('ogg');
  });

  it('detects MP3 with ID3 tag', () => {
    const buf = makeBuffer([0x49, 0x44, 0x33]);
    expect(detectFormat(buf)).toBe('mp3');
  });

  it('detects MP3 sync frame (FF FB)', () => {
    // 0xFF, 0xFB: top 3 bits of byte[1] are 0xE0, lower bits non-zero (layer bits)
    const buf = makeBuffer([0xff, 0xfb, 0x90, 0x00]);
    expect(detectFormat(buf)).toBe('mp3');
  });

  it('detects AAC ADTS (FF F1)', () => {
    const buf = makeBuffer([0xff, 0xf1]);
    expect(detectFormat(buf)).toBe('aac');
  });

  it('detects AAC ADTS (FF F9)', () => {
    const buf = makeBuffer([0xff, 0xf9]);
    expect(detectFormat(buf)).toBe('aac');
  });

  it('returns null for unrecognised format', () => {
    const buf = makeBuffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(buf)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getImageDimensionsFromHeader
// ---------------------------------------------------------------------------
describe('getImageDimensionsFromHeader', () => {
  function u32be(n: number): number[] {
    return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  function u16be(n: number): number[] {
    return [(n >> 8) & 0xff, n & 0xff];
  }
  function u16le(n: number): number[] {
    return [n & 0xff, (n >> 8) & 0xff];
  }
  function u24le(n: number): number[] {
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
  }

  it('returns null for buffers shorter than required', () => {
    expect(getImageDimensionsFromHeader(new Uint8Array(4).buffer)).toBeNull();
  });

  it('parses PNG IHDR (width/height at bytes 16-23)', () => {
    // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) + width (4) + height (4) = 24 bytes
    const buf = new Uint8Array(24);
    // PNG signature
    buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    // IHDR chunk length + type (not used by parser, just needs bytes 16-23)
    // bytes 8-11: chunk length, 12-15: 'IHDR'
    // bytes 16-19: width, 20-23: height
    buf.set(u32be(800), 16);
    buf.set(u32be(600), 20);
    const result = getImageDimensionsFromHeader(buf.buffer);
    expect(result).toEqual({ width: 800, height: 600 });
  });

  it('parses JPEG SOF0 marker (FFC0)', () => {
    // SOI(2) + APP0 segment(4+length) + SOF0
    // Build minimal: SOI + SOF0 immediately after (marker FF C0, seglen, precision, height, width)
    // Segment: FF C0 [len=0x000B] [precision=8] [height HH] [width WW]
    const bytes: number[] = [0xff, 0xd8]; // SOI
    // SOF0: FF C0, length=11 (big-endian), precision=8, height=480, width=640
    bytes.push(0xff, 0xc0);        // marker
    bytes.push(...u16be(11));       // segment length (includes 2-byte length field)
    bytes.push(8);                  // precision
    bytes.push(...u16be(480));      // height at offset+5
    bytes.push(...u16be(640));      // width at offset+7
    bytes.push(3);                  // components
    // Pad to ensure len check passes
    while (bytes.length < 20) bytes.push(0);
    const result = getImageDimensionsFromHeader(new Uint8Array(bytes).buffer);
    expect(result).toEqual({ height: 480, width: 640 });
  });

  it('parses JPEG SOF1 marker (FFC1)', () => {
    const bytes: number[] = [0xff, 0xd8];
    bytes.push(0xff, 0xc1);
    bytes.push(...u16be(11));
    bytes.push(8);
    bytes.push(...u16be(1080));
    bytes.push(...u16be(1920));
    bytes.push(3);
    while (bytes.length < 20) bytes.push(0);
    const result = getImageDimensionsFromHeader(new Uint8Array(bytes).buffer);
    expect(result).toEqual({ height: 1080, width: 1920 });
  });

  it('parses JPEG SOF2 marker (FFC2 — progressive)', () => {
    const bytes: number[] = [0xff, 0xd8];
    bytes.push(0xff, 0xc2);
    bytes.push(...u16be(11));
    bytes.push(8);
    bytes.push(...u16be(720));
    bytes.push(...u16be(1280));
    bytes.push(3);
    while (bytes.length < 20) bytes.push(0);
    const result = getImageDimensionsFromHeader(new Uint8Array(bytes).buffer);
    expect(result).toEqual({ height: 720, width: 1280 });
  });

  it('skips non-SOF JPEG segments to find SOF', () => {
    // SOI + APP0 (FF E0, len=16) + SOF0
    const bytes: number[] = [0xff, 0xd8];
    // APP0 segment: marker FF E0, length=16 (includes 2-byte len field)
    bytes.push(0xff, 0xe0);
    bytes.push(...u16be(16)); // 2-byte length
    // 14 more bytes of APP0 data
    for (let i = 0; i < 14; i++) bytes.push(0x00);
    // SOF0
    bytes.push(0xff, 0xc0);
    bytes.push(...u16be(11));
    bytes.push(8);
    bytes.push(...u16be(200));
    bytes.push(...u16be(300));
    bytes.push(3);
    while (bytes.length < 40) bytes.push(0);
    const result = getImageDimensionsFromHeader(new Uint8Array(bytes).buffer);
    expect(result).toEqual({ height: 200, width: 300 });
  });

  it('returns null for JPEG with no SOF marker in buffer', () => {
    // SOI only — buffer too small to contain SOF
    const bytes = [0xff, 0xd8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(getImageDimensionsFromHeader(new Uint8Array(bytes).buffer)).toBeNull();
  });

  it('parses WebP VP8 (lossy)', () => {
    // RIFF(4) + filesize(4) + WEBP(4) + VP8 (4) + chunksize(4) + frameTag(3) + startCode(3) + w(2) + h(2)
    const bytes = new Uint8Array(34);
    // RIFF
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    // file size (skip)
    bytes.set([0x00, 0x00, 0x00, 0x00], 4);
    // WEBP
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    // VP8  (note: trailing space)
    bytes.set([0x56, 0x50, 0x38, 0x20], 12);
    // chunk size
    bytes.set([0x00, 0x00, 0x00, 0x00], 16);
    // 3 bytes frame tag + 3 bytes start code (offset 20-22)
    bytes.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a], 20);
    // width at offset 26 (little-endian, low 14 bits), height at 28
    const wRaw = 640 & 0x3fff;
    const hRaw = 480 & 0x3fff;
    bytes[26] = wRaw & 0xff;
    bytes[27] = (wRaw >> 8) & 0xff;
    bytes[28] = hRaw & 0xff;
    bytes[29] = (hRaw >> 8) & 0xff;
    const result = getImageDimensionsFromHeader(bytes.buffer);
    expect(result).toEqual({ width: 640, height: 480 });
  });

  it('parses WebP VP8L (lossless)', () => {
    const bytes = new Uint8Array(34);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x00, 0x00, 0x00, 0x00], 4);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    // VP8L
    bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
    // chunk size (4 bytes at 16)
    bytes.set([0x00, 0x00, 0x00, 0x00], 16);
    // signature byte at offset 20
    bytes[20] = 0x2f;
    // bits at offset 21 (little-endian u32): width-1 in bits 0-13, height-1 in bits 14-27
    const w = 320;
    const h = 240;
    const bits = (w - 1) | ((h - 1) << 14);
    bytes[21] = bits & 0xff;
    bytes[22] = (bits >> 8) & 0xff;
    bytes[23] = (bits >> 16) & 0xff;
    bytes[24] = (bits >> 24) & 0xff;
    const result = getImageDimensionsFromHeader(bytes.buffer);
    expect(result).toEqual({ width: 320, height: 240 });
  });

  it('parses WebP VP8X (extended)', () => {
    const bytes = new Uint8Array(34);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x00, 0x00, 0x00, 0x00], 4);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    // VP8X
    bytes.set([0x56, 0x50, 0x38, 0x58], 12);
    // chunk size
    bytes.set([0x00, 0x00, 0x00, 0x00], 16);
    // flags at offset 20 (4 bytes), reserved at 24
    bytes.set([0x00, 0x00, 0x00, 0x00], 20);
    // canvas width minus 1 at bytes 24-26 (3 bytes LE), canvas height minus 1 at 27-29
    const wMinus1 = 1279; // width=1280
    const hMinus1 = 719;  // height=720
    bytes.set(u24le(wMinus1), 24);
    bytes.set(u24le(hMinus1), 27);
    const result = getImageDimensionsFromHeader(bytes.buffer);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  it('returns null for unknown format', () => {
    const buf = new Uint8Array(32).fill(0);
    expect(getImageDimensionsFromHeader(buf.buffer)).toBeNull();
  });
});
