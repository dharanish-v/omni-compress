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
