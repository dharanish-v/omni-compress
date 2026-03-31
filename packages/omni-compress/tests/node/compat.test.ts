import { describe, it, expect, vi } from 'vitest';
import { Compressor } from '../../src/index';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Compressor (compat shim)', () => {
  const fixturesDir = path.join(__dirname, '../fixtures');
  const samplePng = fs.readFileSync(path.join(fixturesDir, 'sample.png'));
  const mockFile = new Blob([samplePng], { type: 'image/png' });

  it('should compress an image using the callback API', async () => {
    return new Promise<void>((resolve, reject) => {
      new Compressor(mockFile, {
        quality: 0.6,
        mimeType: 'image/webp',
        strict: false,
        success(result) {
          try {
            expect(result).toBeInstanceOf(Blob);
            expect(result.size).toBeGreaterThan(0);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error(err) {
          reject(err);
        },
      });
    });
  });

  it('should default to image/jpeg if no mimeType is provided', async () => {
    return new Promise<void>((resolve, reject) => {
      new Compressor(mockFile, {
        strict: false,
        success(result) {
          try {
            expect(result.type).toBe('image/jpeg');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error(err) {
          reject(err);
        },
      });
    });
  });

  it('should respect the strict option', async () => {
    // Small dummy blob that will definitely grow during JPEG compression
    const tinyBlob = mockFile; // Use valid PNG but set high quality JPEG to force growth
    
    return new Promise<void>((resolve, reject) => {
      new Compressor(tinyBlob, {
        strict: true,
        quality: 1.0,
        mimeType: 'image/jpeg',
        success(result) {
          try {
            // If it returns the original file, type should still be image/png
            expect(result.type).toBe('image/png');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error(err) {
          reject(err);
        },
      });
    });
  });

  it('should handle convertSize', async () => {
    return new Promise<void>((resolve, reject) => {
      new Compressor(mockFile, {
        convertSize: 10, // Very small to force conversion to JPEG
        mimeType: 'image/png',
        strict: false,
        success(result) {
          try {
            expect(result.type).toBe('image/jpeg');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error(err) {
          reject(err);
        },
      });
    });
  });

  it('should call error callback on invalid input', async () => {
    const invalidBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    return new Promise<void>((resolve, reject) => {
      new Compressor(invalidBlob, {
        error(err) {
          expect(err).toBeInstanceOf(Error);
          resolve();
        },
        success() {
          reject(new Error('Should have failed'));
        }
      });
    });
  });
});
