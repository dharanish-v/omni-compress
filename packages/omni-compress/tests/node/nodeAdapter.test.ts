import { describe, it, expect } from 'vitest';
import { OmniCompressor } from '../../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('Node Adapter (child_process FFmpeg)', () => {
  const fixturesDir = path.join(__dirname, '../fixtures');

  it('should compress a PNG to WebP', async () => {
    const inputPath = path.join(fixturesDir, 'sample.png');
    const buffer = fs.readFileSync(inputPath);
    
    // We mock a Blob or pass the buffer. Our API says File | Blob. 
    // In node, we can pass a polyfilled Blob or directly test the internal method if Blob polyfill is annoying.
    // However, the Router expects a Blob/File. Let's create a Blob using the native Node Blob.
    const blob = new Blob([buffer], { type: 'image/png' });

    const result = await OmniCompressor.process(blob, {
      type: 'image',
      format: 'webp',
      quality: 0.5,
      originalFileName: 'sample.png',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    expect(result.type).toBe('image/webp');
  });

  it('should compress a WAV to MP3', async () => {
    const inputPath = path.join(fixturesDir, 'sample.wav');
    const buffer = fs.readFileSync(inputPath);
    
    const blob = new Blob([buffer], { type: 'audio/wav' });

    const result = await OmniCompressor.process(blob, {
      type: 'audio',
      format: 'mp3',
      bitrate: '64k',
      originalFileName: 'sample.wav',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    expect(result.type).toBe('audio/mp3'); // Typical mime for mp3
  });
});
