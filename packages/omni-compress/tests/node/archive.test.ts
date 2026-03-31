import { describe, it, expect, vi, beforeAll } from 'vitest';
import { archive, archiveStream } from '../../src/archive';
import { AbortError } from '../../src/core/errors';
import { OmniCompressor } from '../../src/index';

import * as fflate from 'fflate';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('fflate', async () => {
  const actual = await vi.importActual('fflate') as any;
  return {
    ...actual,
    zip: vi.fn(actual.zip),
  };
});

describe('Archive (ZIP)', () => {
  // ... (rest of tests)
  it('should throw EncoderError when zip fails', async () => {
    const mockZip = vi.mocked(fflate.zip);
    mockZip.mockImplementationOnce((files, cb) => {
      // @ts-ignore
      cb(new Error('Mock zip error'), null);
    });

    const entries = [{ name: 'test.txt', data: new Uint8Array([1]) }];
    await expect(archive(entries)).rejects.toThrow('ZIP compression failed');
  });
  beforeAll(() => {
    OmniCompressor.setLogLevel('debug');
  });

  const fixturesDir = path.join(__dirname, '../fixtures');
  const samplePng = fs.readFileSync(path.join(fixturesDir, 'sample.png'));

  const mockImage = new Blob([samplePng], { type: 'image/png' });
  const mockAudio = new Blob([new Uint8Array(200)], { type: 'audio/wav' });
  const mockFile = new Blob([new Uint8Array(50)], { type: 'application/pdf' });

  it('should create a ZIP archive from multiple files', async () => {
    const entries = [
      { name: 'test.png', data: mockImage },
      { name: 'test.pdf', data: mockFile },
    ];

    const result = await archive(entries);

    expect(result.format).toBe('zip');
    expect(result.blob.type).toBe('application/zip');
    expect(result.originalSize).toBe(samplePng.length + 50);
    expect(result.compressedSize).toBeGreaterThan(0);
  });

  it('should support smartOptimize to pre-compress media', async () => {
    const entries = [
      { name: 'photo.png', data: mockImage },
      { name: 'document.pdf', data: mockFile },
      { name: 'noext', data: mockImage }, // file with no extension
    ];

    const progressValues: number[] = [];
    const result = await archive(entries, { 
      smartOptimize: true,
      onProgress: (p) => progressValues.push(p)
    });

    expect(result.format).toBe('zip');
    expect(result.blob.size).toBeGreaterThan(0);
    expect(progressValues).toContain(100);
    expect(progressValues.length).toBeGreaterThan(0);
  });

  it('should support smartOptimize in archiveStream', async () => {
    const entries = [
      { name: 'photo.png', data: mockImage },
    ];

    const stream = archiveStream(entries, { smartOptimize: true });
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should handle smartOptimize when media is already optimized', async () => {
    // webp -> avif (should trigger compression)
    const webpBlob = new Blob([samplePng], { type: 'image/webp' });
    const entries = [{ name: 'test.webp', data: webpBlob }];
    const result = await archive(entries, { smartOptimize: true });
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('should handle smartOptimize for audio', async () => {
    // Using sample.wav fixture
    const sampleWav = fs.readFileSync(path.join(fixturesDir, 'sample.wav'));
    const wavBlob = new Blob([sampleWav], { type: 'audio/wav' });
    const entries = [{ name: 'test.wav', data: wavBlob }];
    const result = await archive(entries, { smartOptimize: true });
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('should respect AbortSignal during smartOptimize pre-compression', async () => {
    const entries = [{ name: 'test.png', data: mockImage }];
    const controller = new AbortController();
    
    // This is tricky to time, but we can abort right before calling archive
    const promise = archive(entries, { 
      smartOptimize: true, 
      signal: controller.signal,
      onProgress: () => controller.abort() // abort on first progress
    });
    
    await expect(promise).rejects.toThrow(AbortError);
  });

  it('should respect AbortSignal during archive', async () => {
    const entries = [
      { name: 'large.png', data: mockImage },
    ];
    const controller = new AbortController();
    controller.abort();

    await expect(archive(entries, { signal: controller.signal }))
      .rejects.toThrow(AbortError);
  });

  it('should create a ZIP stream via archiveStream', async () => {
    const entries = [
      { name: 'stream.png', data: mockImage },
    ];

    const stream = archiveStream(entries);
    expect(stream).toBeInstanceOf(ReadableStream);

    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    expect(totalLength).toBeGreaterThan(0);
  });

  it('should respect AbortSignal during archiveStream', async () => {
    const entries = [
      { name: 'stream.png', data: mockImage },
    ];
    const controller = new AbortController();
    
    // Abort before starting
    controller.abort();
    const stream = archiveStream(entries, { signal: controller.signal });
    const reader = stream.getReader();
    
    await expect(reader.read()).rejects.toThrow(AbortError);
  });
});
