import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../src/core/logger';

describe('Logger', () => {
  beforeEach(() => {
    logger.setLevel('debug'); // reset to most verbose before each test
  });

  it('is a singleton (same reference)', async () => {
    const { logger: logger2 } = await import('../../src/core/logger');
    expect(logger).toBe(logger2);
  });

  it('logs debug messages at debug level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.setLevel('debug');
    logger.debug('test debug');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test debug'));
    spy.mockRestore();
  });

  it('logs info messages at info level', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.setLevel('info');
    logger.info('test info');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test info'));
    spy.mockRestore();
  });

  it('logs warn messages at warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.setLevel('warn');
    logger.warn('test warn');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test warn'));
    spy.mockRestore();
  });

  it('logs error messages at error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setLevel('error');
    logger.error('test error');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test error'));
    spy.mockRestore();
  });

  it('suppresses debug messages when level is info', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.setLevel('info');
    logger.debug('should be hidden');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('suppresses info and debug when level is warn', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.setLevel('warn');
    logger.debug('hidden');
    logger.info('hidden');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('suppresses all but error when level is error', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setLevel('error');
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('hidden');
    logger.error('visible');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('visible'));
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('passes additional args to console', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.setLevel('info');
    logger.info('with extra', { key: 'value' }, 42);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('with extra'), { key: 'value' }, 42);
    spy.mockRestore();
  });
});
