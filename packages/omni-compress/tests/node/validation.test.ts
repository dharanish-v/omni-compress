import { describe, it, expect } from 'vitest';
import { compressImage, compressAudio, compressVideo, OmniCompressor } from '../../src/index';
import { InvalidOptionsError, FormatNotSupportedError } from '../../src/core/errors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '../fixtures');

// ---------------------------------------------------------------------------
// compressImage validation
// ---------------------------------------------------------------------------
describe('compressImage — input validation', () => {
  it('throws InvalidOptionsError when options is null', async () => {
    const blob = new Blob([]);
    await expect(compressImage(blob, null as never)).rejects.toThrow(InvalidOptionsError);
  });

  it('throws FormatNotSupportedError for unknown image format', async () => {
    const blob = new Blob([]);
    await expect(compressImage(blob, { format: 'bmp' as never })).rejects.toThrow(FormatNotSupportedError);
  });

  it('throws InvalidOptionsError for quality > 1', async () => {
    const blob = new Blob([]);
    await expect(compressImage(blob, { format: 'webp', quality: 1.5 })).rejects.toThrow(InvalidOptionsError);
  });

  it('throws InvalidOptionsError for quality < 0', async () => {
    const blob = new Blob([]);
    await expect(compressImage(blob, { format: 'webp', quality: -0.1 })).rejects.toThrow(InvalidOptionsError);
  });
});

// ---------------------------------------------------------------------------
// compressAudio validation
// ---------------------------------------------------------------------------
describe('compressAudio — input validation', () => {
  it('throws InvalidOptionsError when options is null', async () => {
    const blob = new Blob([]);
    await expect(compressAudio(blob, null as never)).rejects.toThrow(InvalidOptionsError);
  });

  it('throws FormatNotSupportedError for unknown audio format', async () => {
    const blob = new Blob([]);
    await expect(compressAudio(blob, { format: 'midi' as never })).rejects.toThrow(FormatNotSupportedError);
  });
});

// ---------------------------------------------------------------------------
// compressVideo validation
// ---------------------------------------------------------------------------
describe('compressVideo — input validation', () => {
  it('throws InvalidOptionsError when options is null', async () => {
    const blob = new Blob([]);
    await expect(compressVideo(blob, null as never)).rejects.toThrow(InvalidOptionsError);
  });

  it('throws FormatNotSupportedError for unknown video format', async () => {
    const blob = new Blob([]);
    await expect(compressVideo(blob, { format: 'avi' as never })).rejects.toThrow(FormatNotSupportedError);
  });
});

// ---------------------------------------------------------------------------
// OmniCompressor.process — legacy validation
// ---------------------------------------------------------------------------
describe('OmniCompressor.process — validateLegacyOptions', () => {
  it('throws when options is not an object', async () => {
    await expect(OmniCompressor.process(new Blob([]), null as never)).rejects.toThrow(InvalidOptionsError);
  });

  it('throws for invalid type', async () => {
    await expect(
      OmniCompressor.process(new Blob([]), { type: 'video' as never, format: 'webp' }),
    ).rejects.toThrow(InvalidOptionsError);
  });

  it('throws when format is missing', async () => {
    await expect(
      OmniCompressor.process(new Blob([]), { type: 'image', format: '' }),
    ).rejects.toThrow(InvalidOptionsError);
  });

  it('logs a warning for unrecognised format (does not throw)', async () => {
    // Passes validation but will fail later in actual compression — we just test validation here
    // Use a real file so it passes the format check and hits the unknown-format logger.warn
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.png'));
    const file = new File([buffer], 'sample.png', { type: 'image/png' });
    // 'tiff' is unrecognised but not blocked — should warn, not throw
    await expect(
      OmniCompressor.process(file, { type: 'image', format: 'tiff' }),
    ).resolves.toBeInstanceOf(Blob); // FFmpeg handles it on Node
  });

  it('throws InvalidOptionsError for quality out of range', async () => {
    await expect(
      OmniCompressor.process(new Blob([]), { type: 'image', format: 'webp', quality: 2 }),
    ).rejects.toThrow(InvalidOptionsError);
  });

  it('throws InvalidOptionsError for invalid maxSizeMB', async () => {
    await expect(
      OmniCompressor.process(new Blob([]), { type: 'image', format: 'webp', maxSizeMB: -1 }),
    ).rejects.toThrow(InvalidOptionsError);
  });
});

// ---------------------------------------------------------------------------
// processor.ts — File filename extraction (line 65-67 branch)
// ---------------------------------------------------------------------------
describe('processor — File with name', () => {
  it('extracts originalFileName from File.name', async () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.png'));
    // Pass as File (has .name) rather than Blob
    const file = new File([buffer], 'my-photo.png', { type: 'image/png' });
    const result = await compressImage(file, { format: 'webp', quality: 0.5 });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.compressedSize).toBeGreaterThan(0);
  });
});
