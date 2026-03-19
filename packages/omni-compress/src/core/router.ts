export interface CompressorOptions {
  type: 'image' | 'audio';
  format: 'webp' | 'avif' | 'jpeg' | 'png' | 'opus' | 'mp3' | 'flac' | 'wav' | string;
  maxSizeMB?: number;
  quality?: number; // 0.0 to 1.0
  onProgress?: (percent: number) => void;
  originalFileName?: string;
}

export type Environment = 'browser' | 'node';

export interface RouteContext {
  env: Environment;
  isFastPath: boolean;
}

const FAST_PATH_IMAGE_FORMATS = new Set(['webp', 'avif', 'jpeg', 'png', 'jpg']);
// Note: Native browser encoding support for opus/mp3 varies, but we'll assume fast-path
// attempts WebCodecs or MediaRecorder. For heavy formats like FLAC, we force Wasm.
// Since a full WebCodecs muxer is not implemented, we route all audio to the Heavy Path
// unless we strictly want to implement MediaRecorder.
const FAST_PATH_AUDIO_FORMATS = new Set<string>();

export class Router {
  static getEnvironment(): Environment {
    if (typeof process !== 'undefined' && process.versions != null && process.versions.node) {
      return 'node';
    }
    return 'browser';
  }

  static isFastPathSupported(options: CompressorOptions): boolean {
    if (this.getEnvironment() === 'node') return false; // Node delegates to native child_process

    const format = options.format.toLowerCase();
    
    if (options.type === 'image') {
      // Browsers generally support OffscreenCanvas encoding to these formats
      return FAST_PATH_IMAGE_FORMATS.has(format);
    } else {
      // Browsers can sometimes encode these natively
      return FAST_PATH_AUDIO_FORMATS.has(format);
    }
  }

  static evaluate(options: CompressorOptions): RouteContext {
    return {
      env: this.getEnvironment(),
      isFastPath: this.isFastPathSupported(options),
    };
  }
}
