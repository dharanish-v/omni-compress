import { describe, it, expect, vi, afterEach } from 'vitest';
import { Router } from '../../src/core/router';
import { WorkerConfig } from '../../src/core/config';

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

    it('returns true for fast-path video formats', () => {
      mockBrowser();
      expect(Router.isFastPathSupported({ type: 'video', format: 'mp4' })).toBe(true);
      expect(Router.isFastPathSupported({ type: 'video', format: 'webm' })).toBe(true);
    });
  });

  // evaluate routing in browser
  describe('evaluate — worker routing', () => {
    it('uses main thread for small fast-path image below threshold', () => {
      mockBrowser();
      const fileSize = WorkerConfig.mainThreadThreshold - 1;
      const ctx = Router.evaluate({ type: 'image', format: 'webp' }, fileSize);
      expect(ctx.env).toBe('browser');
      expect(ctx.isFastPath).toBe(true);
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('uses Worker for large fast-path image above threshold', () => {
      mockBrowser();
      const fileSize = WorkerConfig.mainThreadThreshold + 1;
      const ctx = Router.evaluate({ type: 'image', format: 'webp' }, fileSize);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('uses main thread for small AVIF below avifMainThreadThreshold', () => {
      mockBrowser();
      const fileSize = WorkerConfig.avifMainThreadThreshold - 1;
      const ctx = Router.evaluate({ type: 'image', format: 'avif' }, fileSize);
      expect(ctx.shouldUseWorker).toBe(false);
    });

    it('uses Worker for AVIF above avifMainThreadThreshold', () => {
      mockBrowser();
      const fileSize = WorkerConfig.avifMainThreadThreshold + 1;
      const ctx = Router.evaluate({ type: 'image', format: 'avif' }, fileSize);
      expect(ctx.shouldUseWorker).toBe(true);
    });

    it('always uses Worker for heavy-path formats (mp3) regardless of size', () => {
      mockBrowser();
      const ctx = Router.evaluate({ type: 'audio', format: 'mp3' }, 100);
      expect(ctx.isFastPath).toBe(false);
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
