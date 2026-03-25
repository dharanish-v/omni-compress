import { describe, it, expect } from 'vitest';
import { FileTooLargeError, OmniCompressError } from '../../src/core/errors';
import { assertFileSizeWithinLimit, SAFE_SIZE_LIMITS } from '../../src/core/utils';

describe('FileTooLargeError', () => {
  it('should be an instance of OmniCompressError', () => {
    const err = new FileTooLargeError(300 * 1024 * 1024, 250 * 1024 * 1024);
    expect(err).toBeInstanceOf(OmniCompressError);
    expect(err).toBeInstanceOf(Error);
  });

  it('should have correct name and code', () => {
    const err = new FileTooLargeError(300 * 1024 * 1024, 250 * 1024 * 1024);
    expect(err.name).toBe('FileTooLargeError');
    expect(err.code).toBe('FILE_TOO_LARGE');
  });

  it('should expose fileSize and maxSize', () => {
    const fileSize = 300 * 1024 * 1024;
    const maxSize = 250 * 1024 * 1024;
    const err = new FileTooLargeError(fileSize, maxSize);
    expect(err.fileSize).toBe(fileSize);
    expect(err.maxSize).toBe(maxSize);
  });

  it('should produce a human-readable message', () => {
    const err = new FileTooLargeError(300 * 1024 * 1024, 250 * 1024 * 1024);
    expect(err.message).toContain('300.0 MB');
    expect(err.message).toContain('250 MB');
  });
});

describe('assertFileSizeWithinLimit', () => {
  it('should throw FileTooLargeError for oversized browser files', () => {
    expect(() => assertFileSizeWithinLimit(300 * 1024 * 1024, 'browser')).toThrowError(
      FileTooLargeError,
    );
  });

  it('should not throw for files within browser limit', () => {
    expect(() => assertFileSizeWithinLimit(100 * 1024 * 1024, 'browser')).not.toThrow();
  });

  it('should not throw for files exactly at the limit', () => {
    expect(() =>
      assertFileSizeWithinLimit(SAFE_SIZE_LIMITS.browser, 'browser'),
    ).not.toThrow();
  });

  it('should never throw for node environment regardless of size', () => {
    expect(() => assertFileSizeWithinLimit(10_000_000_000, 'node')).not.toThrow();
  });

  it('should not throw for zero-size files', () => {
    expect(() => assertFileSizeWithinLimit(0, 'browser')).not.toThrow();
  });
});

describe('SAFE_SIZE_LIMITS', () => {
  it('should have a 250MB browser limit', () => {
    expect(SAFE_SIZE_LIMITS.browser).toBe(250 * 1024 * 1024);
  });

  it('should have no limit for node', () => {
    expect(SAFE_SIZE_LIMITS.node).toBe(Infinity);
  });
});
