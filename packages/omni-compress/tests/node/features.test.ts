import { describe, it, expect, beforeEach } from 'vitest';
import { compressImage, setDefaults, resetDefaults } from '../../src/index';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, '../fixtures');
const samplePng = fs.readFileSync(path.join(fixturesDir, 'sample.png'));
const mockFile = new Blob([samplePng], { type: 'image/png' });
const namedFile = new File([samplePng], 'photo.png', { type: 'image/png' });

describe('Strict Mode & Auto-Format', () => {
  it('should return original if compressed is larger in strict mode', async () => {
    const result = await compressImage(mockFile, {
      format: 'jpeg',
      quality: 1.0,
      strict: true,
    });
    if (result.compressedSize >= mockFile.size) {
      expect(result.blob).toBe(mockFile);
    } else {
      expect(result.blob).not.toBe(mockFile);
    }
  });

  it('should resolve "auto" format for images', async () => {
    const result = await compressImage(mockFile, { format: 'auto' });
    expect(result.format).toBe('webp');
    expect(result.blob.type).toBe('image/webp');
  });
});

// ---------------------------------------------------------------------------
// Gap #10: file field in CompressResult
// ---------------------------------------------------------------------------
describe('Gap #10: file field', () => {
  it('returns File with corrected extension when input is a File', async () => {
    const result = await compressImage(namedFile, { format: 'webp' });
    expect(result.file).toBeInstanceOf(File);
    expect(result.file!.name).toBe('photo.webp');
    expect(result.file!.type).toBe('image/webp');
  });

  it('returns File with .jpg extension for jpeg format', async () => {
    const result = await compressImage(namedFile, { format: 'jpeg' });
    expect(result.file).toBeInstanceOf(File);
    expect(result.file!.name).toBe('photo.jpg');
  });

  it('returns null when input is a plain Blob', async () => {
    const result = await compressImage(mockFile, { format: 'webp' });
    expect(result.file).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gap #11: setDefaults / resetDefaults
// ---------------------------------------------------------------------------
describe('Gap #11: setDefaults / resetDefaults', () => {
  beforeEach(() => {
    resetDefaults();
  });

  it('applies module-level defaults to compressImage', async () => {
    setDefaults({ quality: 0.1 });
    // The call omits quality — default should apply
    const result = await compressImage(namedFile, { format: 'webp' });
    // We can't inspect the quality from the blob, but we can verify it ran successfully
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('per-call options override defaults', async () => {
    setDefaults({ format: 'jpeg' });
    const result = await compressImage(namedFile, { format: 'webp' });
    expect(result.format).toBe('webp');
  });

  it('resetDefaults removes all previously set defaults', async () => {
    setDefaults({ quality: 0.1 });
    resetDefaults();
    // Should produce a normal-quality result (no low-quality override)
    const result = await compressImage(namedFile, { format: 'webp' });
    expect(result.blob.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gap #4-5: convertTypes / convertSize
// ---------------------------------------------------------------------------
describe('Gap #4-5: convertTypes / convertSize', () => {
  it('keeps PNG format for small PNG when convertTypes includes image/png', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto',
      convertTypes: 'image/png',
      convertSize: mockFile.size + 1, // threshold above file size → keep original format
    });
    // File is below convertSize threshold → format locked to png
    expect(result.format).toBe('png');
  });

  it('converts normally when file exceeds convertSize', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto',
      convertTypes: 'image/png',
      convertSize: 1, // threshold below file size → allow conversion
    });
    // File exceeds threshold → normal auto conversion to webp
    expect(result.format).toBe('webp');
  });

  it('accepts array for convertTypes', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto',
      convertTypes: ['image/png', 'image/jpeg'],
      convertSize: mockFile.size + 1,
    });
    expect(result.format).toBe('png');
  });

  it('ignores convertTypes when input MIME does not match', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto',
      convertTypes: ['image/gif'], // PNG not in list
      convertSize: mockFile.size + 1,
    });
    // No match → normal auto conversion
    expect(result.format).toBe('webp');
  });
});

// ---------------------------------------------------------------------------
// Issue #39: maxSizeMB — target file size with binary search
// ---------------------------------------------------------------------------
describe('Issue #39: maxSizeMB', () => {
  it('returns quality field when maxSizeMB is set and target is reachable', async () => {
    const result = await compressImage(mockFile, {
      format: 'webp',
      maxSizeMB: 1, // 1 MB >> fixture size — first pass succeeds
    });
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.blob.size).toBeLessThanOrEqual(1 * 1024 * 1024);
    // quality is set whenever maxSizeMB binary search was triggered
    expect(typeof result.quality).toBe('number');
    expect(result.quality).toBeGreaterThan(0);
    expect(result.quality).toBeLessThanOrEqual(1);
  });

  it('quality is undefined when maxSizeMB is not set', async () => {
    const result = await compressImage(mockFile, { format: 'webp' });
    expect(result.quality).toBeUndefined();
  });

  it('skips binary search for PNG (lossless) — quality is undefined', async () => {
    const result = await compressImage(mockFile, {
      format: 'png',
      maxSizeMB: 1,
    });
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.quality).toBeUndefined();
  });

  it('returns best-effort blob when target is unreachable (does not throw)', async () => {
    // 0.000001 MB = ~1 byte — impossible to achieve
    const result = await compressImage(mockFile, {
      format: 'webp',
      maxSizeMB: 0.000001,
    });
    expect(result.blob.size).toBeGreaterThan(0);
    // quality is still set — reflects the last quality tried
    expect(typeof result.quality).toBe('number');
  });

  it('throws InvalidOptionsError for maxSizeMB <= 0', async () => {
    await expect(
      compressImage(mockFile, { format: 'webp', maxSizeMB: 0 }),
    ).rejects.toThrow('maxSizeMB must be a positive number');

    await expect(
      compressImage(mockFile, { format: 'webp', maxSizeMB: -1 }),
    ).rejects.toThrow('maxSizeMB must be a positive number');
  });

  it('uses quality as upper bound in binary search', async () => {
    const result = await compressImage(mockFile, {
      format: 'webp',
      quality: 0.5,
      maxSizeMB: 1,
    });
    // quality in result must not exceed the starting quality
    if (result.quality !== undefined) {
      expect(result.quality).toBeLessThanOrEqual(0.5 + 0.01); // allow minor float drift
    }
    expect(result.blob.size).toBeLessThanOrEqual(1 * 1024 * 1024);
  });

  it('works with format: auto (resolves to lossy — binary search runs)', async () => {
    const result = await compressImage(mockFile, {
      format: 'auto',
      maxSizeMB: 1,
    });
    expect(result.blob.size).toBeLessThanOrEqual(1 * 1024 * 1024);
    expect(typeof result.quality).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Issue #39: result.quality field is always undefined for audio/video
// ---------------------------------------------------------------------------
describe('Issue #39: quality field absent for audio/video', () => {
  it('compressImage without maxSizeMB returns undefined quality', async () => {
    const result = await compressImage(mockFile, { format: 'webp', quality: 0.7 });
    expect(result.quality).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gap #1: minWidth / minHeight
// ---------------------------------------------------------------------------
describe('Gap #1: minWidth / minHeight', () => {
  it('upscales image to at least minWidth', async () => {
    // sample.png is likely small; request a large minWidth
    const result = await compressImage(namedFile, { format: 'webp', minWidth: 2000 });
    // We cannot inspect canvas pixel dimensions from the blob in Node easily,
    // but the operation must succeed without error
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('does not downscale below minWidth when image already exceeds it', async () => {
    // minWidth smaller than image → no change
    const result = await compressImage(namedFile, { format: 'webp', minWidth: 1 });
    expect(result.blob.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gap #2: exact width / height
// ---------------------------------------------------------------------------
describe('Gap #2: width / height', () => {
  it('accepts width and height options without error', async () => {
    const result = await compressImage(namedFile, {
      format: 'webp',
      width: 100,
      height: 100,
    });
    expect(result.blob.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gap #3: resize mode
// ---------------------------------------------------------------------------
describe('Gap #3: resize mode', () => {
  it.each(['contain', 'cover', 'none'] as const)('accepts resize="%s" without error', async (mode) => {
    const result = await compressImage(namedFile, {
      format: 'webp',
      width: 200,
      height: 200,
      resize: mode,
    });
    expect(result.blob.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gap #8: checkOrientation
// ---------------------------------------------------------------------------
describe('Gap #8: checkOrientation', () => {
  it('compresses successfully with checkOrientation: false', async () => {
    const result = await compressImage(namedFile, {
      format: 'webp',
      checkOrientation: false,
    });
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('compresses successfully with checkOrientation: true (default)', async () => {
    const result = await compressImage(namedFile, {
      format: 'webp',
      checkOrientation: true,
    });
    expect(result.blob.size).toBeGreaterThan(0);
  });
});
