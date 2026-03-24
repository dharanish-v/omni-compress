import { describe, it, expect, beforeAll } from 'vitest';
import { OmniCompressor } from '../../src/index';

// We need a helper to fetch the sample files since we are in the browser
async function fetchFixture(filename: string): Promise<Blob> {
  // Vite/Vitest serves the workspace root during browser tests, 
  // but we might need to adjust the path based on vitest config.
  // For now, let's create a Blob dynamically or use a known data URI.
  
  if (filename === 'sample.png') {
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await fetch(`data:image/png;base64,${pngB64}`);
    return res.blob();
  }
  
  if (filename === 'sample.wav') {
    const wavB64 = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAE=';
    const res = await fetch(`data:audio/wav;base64,${wavB64}`);
    return res.blob();
  }
  
  throw new Error('Unknown fixture');
}

describe('Browser Fast Path (OffscreenCanvas)', () => {
  it('should compress a PNG to WebP using Fast Path', async () => {
    const blob = await fetchFixture('sample.png');

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
});
