import { describe, it, expect, vi, afterEach } from 'vitest';
import { Router } from '../../src/core/router';
import { WorkerConfig, MAIN_THREAD_THRESHOLDS } from '../../src/core/config';

describe('Router (Node Environment)', () => {
  it('detects node environment', () => {
    expect(Router.getEnvironment()).toBe('node');
  });

  it('isFastPathSupported returns false in Node (delegates to native child_process)', () => {
    expect(Router.isFastPathSupported({ type: 'image', format: 'webp' })).toBe(false);
    expect(Router.isFastPathSupported({ type: 'audio', format: 'opus' })).toBe(false);
    expect(Router.isFastPathSupported({ type: 'video', format: 'mp4' })).toBe(false);
  });

  it('evaluate returns node env with shouldUseWorker=true', () => {
    const ctx = Router.evaluate({ type: 'image', format: 'webp' }, 1024);
    expect(ctx.env).toBe('node');
    expect(ctx.isFastPath).toBe(false);
    expect(ctx.shouldUseWorker).toBe(true);
  });
});

describe('Router (Browser Environment — mocked)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockBrowser() {
    vi.spyOn(Router, 'getEnvironment').mockReturnValue('browser');
  }

  // isFastPathSupported in browser
  describe('isFastPathSupported', () => {
    it('returns true for fast-path image formats', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'image', format: 'webp' })).toBe(true);
      expect(Router.isFastPathSupported({ type: 'image', format: 'jpeg' })).toBe(true);
      expect(Router.isFastPathSupported({ type: 'image', format: 'png' })).toBe(true);
      expect(Router.isFastPathSupported({ type: 'image', format: 'jpg' })).toBe(true);
    });

    it('returns false for AVIF (uses @jsquash/avif, not OffscreenCanvas)', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'image', format: 'avif' })).toBe(false);
    });

    it('returns true for fast-path audio formats', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'audio', format: 'aac' })).toBe(true);
      expect(Router.isFastPathSupported({ type: 'audio', format: 'opus' })).toBe(true);
    });

    it('returns false for heavy-path audio formats', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'audio', format: 'mp3' })).toBe(false);
      expect(Router.isFastPathSupported({ type: 'audio', format: 'flac' })).toBe(false);
    });

    it('returns false for video (WebCodecs VideoEncoder not yet implemented — issue #55)', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'video', format: 'mp4' })).toBe(false);
      expect(Router.isFastPathSupported({ type: 'video', format: 'webm' })).toBe(false);
    });
  });

  // evaluate routing in browser
  describe('evaluate — worker routing', () => {
    it('uses main thread for small fast-path image below per-format threshold', () => {
      mockBrowser();
      const fileSize = MAIN_THREAD_THRESHOLDS['webp'] - 1; // 8 MB - 1
      const ctx = Router.evaluate({ type: 'image', format: 'webp' }, fileSize);
      expect(ctx.env).toBe('browser');
      expect(ctx.isFastPath).toBe(true);
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('uses Worker for large fast-path image above threshold', () => {
      mockBrowser();
      const fileSize = MAIN_THREAD_THRESHOLDS['webp'] + 1; // 8 MB + 1
      const ctx = Router.evaluate({ type: 'image', format: 'webp' }, fileSize);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('uses Worker for image when Worker is warm and file exceeds warmWorkerThreshold', () => {
      mockBrowser();
      const fileSize = WorkerConfig.warmWorkerThreshold + 1; // 512 KB + 1
      const ctx = Router.evaluate(
        { type: 'image', format: 'webp' },
        fileSize,
        '',
        () => true, // warm
      );
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('uses main thread for image when Worker is warm but file is tiny', () => {
      mockBrowser();
      const fileSize = WorkerConfig.warmWorkerThreshold - 1; // 512 KB - 1
      const ctx = Router.evaluate(
        { type: 'image', format: 'webp' },
        fileSize,
        '',
        () => true,
      );
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('always uses main thread for AVIF regardless of file size (@ffmpeg/core-mt lacks libaom-av1)', () => {
      mockBrowser();
      // avifMainThreadThreshold is Infinity — all AVIF stays on main thread
      for (const fileSize of [1, 512 * 1024, 5 * 1024 * 1024, 100 * 1024 * 1024]) {
        const ctx = Router.evaluate({ type: 'image', format: 'avif' }, fileSize);
        expect(ctx.shouldUseWorker).toBe(false);
      }
    });

    it('AVIF stays on main thread even when image worker is warm', () => {
      mockBrowser();
      // warm-worker override must NOT apply to AVIF
      const ctx = Router.evaluate({ type: 'image', format: 'avif' }, 5 * 1024 * 1024, '', () => true);
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('always uses Worker for heavy-path formats (mp3) regardless of size', () => {
      mockBrowser();
      const ctx = Router.evaluate({ type: 'audio', format: 'mp3' }, 100);
      expect(ctx.isFastPath).toBe(false);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('always uses Worker for video regardless of size (WebCodecs not implemented)', () => {
      mockBrowser();
      const ctx = Router.evaluate({ type: 'video', format: 'mp4' }, 100);
      expect(ctx.isFastPath).toBe(false);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('uses main thread for small WAV → AAC fast path (cold worker)', () => {
      mockBrowser();
      const fileSize = WorkerConfig.audioMainThreadThreshold - 1; // 1 MB - 1
      const ctx = Router.evaluate(
        { type: 'audio', format: 'aac' },
        fileSize,
        'audio/wav',
      );
      expect(ctx.isFastPath).toBe(true);
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('uses Worker for non-WAV audio fast path (skip wasteful throw-retry cycle)', () => {
      mockBrowser();
      const ctx = Router.evaluate(
        { type: 'audio', format: 'aac' },
        100, // tiny file
        'audio/mpeg', // MP3 input — not WAV
      );
      expect(ctx.isFastPath).toBe(true);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('uses Worker for audio fast path with unknown MIME type (conservative)', () => {
      mockBrowser();
      const ctx = Router.evaluate(
        { type: 'audio', format: 'opus' },
        100,
        '', // empty type — unknown
      );
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('respects useWorker=true override even for small files', () => {
      mockBrowser();
      const ctx = Router.evaluate({ type: 'image', format: 'webp', useWorker: true }, 100);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('respects useWorker=false override even for large files', () => {
      mockBrowser();
      const ctx = Router.evaluate({ type: 'image', format: 'webp', useWorker: false }, 999_999_999);
      expect(ctx.shouldUseWorker).toBe(false);
    });
  });
});
