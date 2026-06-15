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

  it('should resize an image in Node', async () => {
    const inputPath = path.join(fixturesDir, 'sample.png');
    const blob = new Blob([fs.readFileSync(inputPath)], { type: 'image/png' });

    const result = await OmniCompressor.process(blob, {
      type: 'image',
      format: 'webp',
      maxWidth: 100,
      originalFileName: 'sample.png',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('should support custom audio bitrate in Node', async () => {
    const inputPath = path.join(fixturesDir, 'sample.wav');
    const blob = new Blob([fs.readFileSync(inputPath)], { type: 'audio/wav' });

    const result = await OmniCompressor.process(blob, {
      type: 'audio',
      format: 'opus',
      bitrate: '32k',
      originalFileName: 'sample.wav',
    });

    expect(result.size).toBeGreaterThan(0);
  });

  it('should compress a WAV to WebM Opus (Opus codec in WebM container)', async () => {
    const inputPath = path.join(fixturesDir, 'sample.wav');
    const blob = new Blob([fs.readFileSync(inputPath)], { type: 'audio/wav' });

    const result = await OmniCompressor.process(blob, {
      type: 'audio',
      format: 'webm',
      bitrate: '64k',
      originalFileName: 'sample.wav',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
    expect(result.type).toBe('audio/webm');

    // Verify the output is a real WebM/Matroska container (EBML magic bytes: 0x1A 0x45 0xDF 0xA3).
    const header = new Uint8Array(await result.arrayBuffer()).subarray(0, 4);
    expect(Array.from(header)).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });
});
