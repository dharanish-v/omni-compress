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
