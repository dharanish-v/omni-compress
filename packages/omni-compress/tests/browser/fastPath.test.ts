import { describe, it, expect } from 'vitest';
import { OmniCompressor } from '../../src/index';

// ---------------------------------------------------------------------------
// Browser capability helpers — used for conditional test skipping
// ---------------------------------------------------------------------------

/** OffscreenCanvas WebP encoding: Chrome/Firefox/Edge. NOT Safari until 17.4+. */
function supportsOffscreenCanvasWebP(): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false;
  try {
    const oc = new OffscreenCanvas(1, 1);
    const ctx = oc.getContext('2d');
    return ctx !== null;
  } catch {
    return false;
  }
}

/** WebCodecs AudioEncoder: Chrome/Edge (universal), Firefox (partial), Safari 17+. */
function supportsWebCodecsAudio(): boolean {
  return typeof AudioEncoder !== 'undefined';
}

async function makePngBlob(): Promise<Blob> {
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const res = await fetch(`data:image/png;base64,${pngB64}`);
  return res.blob();
}

async function makeWavBlob(): Promise<Blob> {
  const wavB64 =
    'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAE=';
  const res = await fetch(`data:audio/wav;base64,${wavB64}`);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Fast Path: OffscreenCanvas image encoding
// ---------------------------------------------------------------------------
describe('Browser Fast Path (OffscreenCanvas)', () => {
  it('compresses PNG to WebP via OffscreenCanvas', { skip: !supportsOffscreenCanvasWebP() }, async () => {
    const blob = await makePngBlob();
    const result = await OmniCompressor.process(blob, {
      type: 'image',
      format: 'webp',
      quality: 0.5,
      maxWidth: 5,
      originalFileName: 'sample.png',
    });
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    expect(result.type).toBe('image/webp');
  });

  it('compresses PNG to JPEG via OffscreenCanvas', { skip: !supportsOffscreenCanvasWebP() }, async () => {
    const blob = await makePngBlob();
    const result = await OmniCompressor.process(blob, {
      type: 'image',
      format: 'jpeg',
      quality: 0.7,
      originalFileName: 'sample.png',
    });
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    expect(result.type).toBe('image/jpeg');
  });
});

// ---------------------------------------------------------------------------
// Fast Path: WebCodecs audio encoding
// ---------------------------------------------------------------------------
describe('Browser Fast Path (WebCodecs AudioEncoder)', () => {
  it('encodes WAV to AAC via WebCodecs', { skip: !supportsWebCodecsAudio() }, async () => {
    const blob = await makeWavBlob();
    const result = await OmniCompressor.process(blob, {
      type: 'audio',
      format: 'aac',
      originalFileName: 'sample.wav',
    });
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });
});
