/* eslint-disable no-console */

/** Verbosity level for the omni-compress internal logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Internal logger singleton with configurable verbosity.
 * All messages are prefixed with `[OmniCompress:<LEVEL>]`.
 *
 * Use {@link logger.setLevel} to increase or suppress output.
 * Default level is `'info'`.
 */
class Logger {
  private level: LogLevel = 'info';

  /**
   * Sets the minimum log level. Messages below this level are suppressed.
   * @param level - One of `'debug'` | `'info'` | `'warn'` | `'error'`.
   */
  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  /** Emits a debug-level message. Only visible when level is `'debug'`. */
  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.debug(`[OmniCompress:DEBUG] ${message}`, ...args);
    }
  }

  /** Emits an info-level message. Visible at `'info'` level and above (default). */
  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.info(`[OmniCompress:INFO] ${message}`, ...args);
    }
  }

  /** Emits a warning. Visible at `'warn'` level and above. */
  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(`[OmniCompress:WARN] ${message}`, ...args);
    }
  }

  /** Emits an error message. Always visible unless level is set higher (not recommended). */
  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(`[OmniCompress:ERROR] ${message}`, ...args);
    }
  }
}

/** The global logger instance. Use `logger.setLevel('debug')` to enable verbose output. */
export const logger = new Logger();
