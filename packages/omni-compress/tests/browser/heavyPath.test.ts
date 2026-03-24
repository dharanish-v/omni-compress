import { describe, it, expect, beforeAll } from 'vitest';
import { OmniCompressor, WorkerConfig } from '../../src/index';

async function fetchFixture(filename: string): Promise<Blob> {
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

describe('Browser Heavy Path (FFmpeg Wasm)', () => {
  beforeAll(() => {
    // In a browser test environment via Vitest, the root is usually served, 
    // but the workers might need explicit URLs if the ?worker&url plugin doesn't resolve.
    // For this test, Vitest's Vite integration should handle ?worker&url automatically,
    // assuming it resolves from src/. If it fails, we will mock or point to dist.
  });

  // Since Heavy Path (Wasm) requires SharedArrayBuffer and COOP/COEP headers,
  // we enabled them in vitest.workspace.ts.

  it('should compress a WAV to MP3 using Heavy Path', async () => {
    const blob = await fetchFixture('sample.wav');

    const result = await OmniCompressor.process(blob, {
      type: 'audio',
      format: 'mp3',
      bitrate: '64k',
      originalFileName: 'sample.wav',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    // Note: The MIME type returned from the Heavy Path is determined by getMimeType
    // which should be 'audio/mpeg' for mp3.
    expect(result.type).toBe('audio/mp3');
  });
});
