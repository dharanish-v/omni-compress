/**
 * Base error class for all omni-compress errors.
 * Provides a machine-readable `code` field for programmatic error handling.
 */
export class OmniCompressError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'OmniCompressError';
    this.code = code;
  }
}

/**
 * Thrown when a file exceeds the safe processing threshold for the current environment.
 *
 * In browser environments, WebAssembly linear memory is limited (typically 1–4 GB).
 * Files above a safe threshold will fail with opaque OOM errors.
 * This error provides a clear, actionable message before that happens.
 */
export class FileTooLargeError extends OmniCompressError {
  readonly fileSize: number;
  readonly maxSize: number;

  constructor(fileSize: number, maxSize: number) {
    const fileMB = (fileSize / 1024 / 1024).toFixed(1);
    const maxMB = (maxSize / 1024 / 1024).toFixed(0);
    super(
      `File size (${fileMB} MB) exceeds the safe processing limit (${maxMB} MB). ` +
        `Processing this file would likely exhaust WebAssembly memory. ` +
        `Consider reducing the file size before compression.`,
      'FILE_TOO_LARGE',
    );
    this.name = 'FileTooLargeError';
    this.fileSize = fileSize;
    this.maxSize = maxSize;
  }
}

/**
 * Thrown when the requested format is not supported in the current environment.
 *
 * @example
 * // AVIF encoding is not supported in OffscreenCanvas — routed to FFmpeg Wasm.
 * // HEVC (H.265) video is never available due to patent restrictions.
 */
export class FormatNotSupportedError extends OmniCompressError {
  readonly format: string;

  constructor(message: string, format: string) {
    super(message, 'FORMAT_NOT_SUPPORTED');
    this.name = 'FormatNotSupportedError';
    this.format = format;
  }
}

/**
 * Thrown when the provided options object is invalid or contradictory.
 */
export class InvalidOptionsError extends OmniCompressError {
  constructor(message: string) {
    super(message, 'INVALID_OPTIONS');
    this.name = 'InvalidOptionsError';
  }
}

/**
 * Thrown when processing is cancelled via an AbortSignal.
 *
 * @example
 * const controller = new AbortController();
 * controller.abort();
 * // → throws AbortError
 */
export class AbortError extends OmniCompressError {
  constructor(message = 'The operation was aborted') {
    super(message, 'ABORTED');
    this.name = 'AbortError';
  }
}

/**
 * Thrown when the underlying encoder (FFmpeg Wasm, OffscreenCanvas, etc.) fails.
 * Wraps the raw encoder error for context while preserving a typed, catchable error.
 */
export class EncoderError extends OmniCompressError {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, 'ENCODER_FAILED');
    this.name = 'EncoderError';
    this.cause = cause;
  }
}
