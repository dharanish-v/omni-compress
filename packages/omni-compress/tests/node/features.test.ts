import { describe, it, expect } from 'vitest';
import { compressImage } from '../../src/index';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Strict Mode & Auto-Format', () => {
  const fixturesDir = path.join(__dirname, '../fixtures');
  const samplePng = fs.readFileSync(path.join(fixturesDir, 'sample.png'));
  const mockFile = new Blob([samplePng], { type: 'image/png' });

  it('should return original if compressed is larger in strict mode', async () => {
    // Use a small but valid PNG. High quality JPEG conversion might still grow it.
    const result = await compressImage(mockFile, {
      format: 'jpeg',
      quality: 1.0,
      strict: true
    });

    if (result.compressedSize >= mockFile.size) {
        expect(result.blob).toBe(mockFile);
    } else {
        expect(result.blob).not.toBe(mockFile);
    }
  });

  it('should resolve "auto" format for images', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto'
    });

    // Default for images is webp
    expect(result.format).toBe('webp');
    expect(result.blob.type).toBe('image/webp');
  });
});
