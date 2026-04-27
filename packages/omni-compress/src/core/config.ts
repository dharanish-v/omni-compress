/**
 * Per-format main-thread execution thresholds (in bytes).
 * When a file's size is below this value the library runs on the main thread
 * instead of spawning a Web Worker, avoiding IPC overhead.
 *
 * Formats not listed fall back to `WorkerConfig.mainThreadThreshold`.
 * JPEG/PNG use higher limits because OffscreenCanvas is GPU-accelerated for
 * those formats and runs very fast even at 10-20 MB.
 */
export const MAIN_THREAD_THRESHOLDS: Record<string, number> = {
  jpeg: 20 * 1024 * 1024, // 20 MB — GPU-accelerated JPEG fast path
  jpg: 20 * 1024 * 1024,
  png: 16 * 1024 * 1024, // 16 MB — GPU-accelerated PNG fast path
  webp: 8 * 1024 * 1024, // 8 MB — GPU-accelerated WebP fast path
};

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
  /**
   * Threshold (in bytes) for AVIF main-thread execution.
   * AVIF is much heavier than WebP/JPEG, so the threshold is lower by default.
   * Default: 512KB (512 * 1024).
   */
  avifMainThreadThreshold: 512 * 1024,
  /**
   * Threshold (in bytes) for WAV audio fast-path execution on the main thread.
   * WebCodecs AudioEncoder is CPU-intensive per byte — use a lower limit than images.
   * Non-WAV inputs always bypass the main thread (fast path only decodes WAV).
   * Default: 1MB (1 * 1024 * 1024).
   */
  audioMainThreadThreshold: 1 * 1024 * 1024,
  /**
   * When a Worker is already warm (loaded within the idle window),
   * cold-start cost is gone. Only postMessage overhead (~1 ms) remains.
   * Use this lower threshold instead of per-engine cold thresholds.
   * Default: 512KB (512 * 1024).
   */
  warmWorkerThreshold: 512 * 1024,
};
