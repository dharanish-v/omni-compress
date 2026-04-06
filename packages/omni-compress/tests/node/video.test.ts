import { describe, it, expect } from 'vitest';
import { compressVideo, isVideoFile } from '../../src/index';

describe('Video Support', () => {
  describe('isVideoFile', () => {
    it('should identify video files by extension', () => {
      const file = { name: 'test.mp4' } as any;
      expect(isVideoFile(file)).toBe(true);
    });

    it('should identify video files by mime type', () => {
      const file = { type: 'video/webm' } as any;
      expect(isVideoFile(file)).toBe(true);
    });

    it('should return false for non-video files', () => {
      const file = { name: 'test.png', type: 'image/png' } as any;
      expect(isVideoFile(file)).toBe(false);
    });
  });

  describe('compressVideo', () => {
    it('should throw error for invalid options', async () => {
      const blob = new Blob(['fake video'], { type: 'video/mp4' });
      // @ts-ignore
      await expect(compressVideo(blob, null)).rejects.toThrow('Options object is required');
    });

    it('should throw error for unsupported format', async () => {
      const blob = new Blob(['fake video'], { type: 'video/mp4' });
      // @ts-ignore
      await expect(compressVideo(blob, { format: 'avi' })).rejects.toThrow('is not a supported video format');
    });
  });
});
