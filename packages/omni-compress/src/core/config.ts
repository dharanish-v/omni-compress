/**
 * Global configuration for Web Workers and execution thresholds.
 */
export const WorkerConfig = {
  /** URL to image.worker.js */
  imageWorkerUrl: '',
  /** URL to audio.worker.js */
  audioWorkerUrl: '',
  /** URL to video.worker.js */
  videoWorkerUrl: '',
  /** URL to ffmpeg-core.js (or ffmpeg-core-mt.js if SharedArrayBuffer is supported) */
  ffmpegCoreUrl: '',
  /** URL to ffmpeg-core.wasm */
  ffmpegWasmUrl: '',
  /** URL to ffmpeg-core.worker.js (required for multi-threading) */
  ffmpegWorkerUrl: '',
  /**
   * Threshold (in bytes) for bypassing Web Workers to avoid communication overhead.
   * Files smaller than this will run on the main thread for lower latency.
   * Default: 4MB (4 * 1024 * 1024).
   * Set to 0 to always use Web Workers.
   */
  mainThreadThreshold: 4 * 1024 * 1024,
};
