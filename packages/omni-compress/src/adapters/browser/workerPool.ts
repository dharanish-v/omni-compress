import type { CompressorOptions } from '../../core/router.js';
import { AbortError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

let workerIdCounter = 0;

interface WorkerJob {
  id: number;
  options: CompressorOptions;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
}

const pendingJobs = new Map<number, WorkerJob>();

export const WorkerConfig = {
  imageWorkerUrl: '',
  audioWorkerUrl: '',
  videoWorkerUrl: '',
  /** URL to ffmpeg-core.js (or ffmpeg-core-mt.js if MT_SUPPORTED is true) */
  ffmpegCoreUrl: '',
  /** URL to ffmpeg-core.wasm */
  ffmpegWasmUrl: '',
  /** URL to ffmpeg-core.worker.js (required for multi-threading) */
  ffmpegWorkerUrl: '',
};

/**
 * Indicates if the current environment supports multi-threaded WebAssembly
 * (requires Cross-Origin Isolation headers / SharedArrayBuffer).
 */
export const MT_SUPPORTED = typeof SharedArrayBuffer !== 'undefined';

// --- Worker Cache ---
// Workers are cached per type and reused across compression calls.
// Each worker self-terminates after an idle timeout to free memory.

const workerCache = new Map<'image' | 'audio' | 'video', Worker>();
const workerIdleTimers = new Map<'image' | 'audio' | 'video', ReturnType<typeof setTimeout>>();

const WORKER_IDLE_TIMEOUT_MS = 60_000; // 60 seconds

function resetWorkerIdleTimer(type: 'image' | 'audio' | 'video') {
  const existing = workerIdleTimers.get(type);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    const worker = workerCache.get(type);
    if (worker) {
      const hasPendingJobs = Array.from(pendingJobs.values()).some(
        (job) => job.options.type === type,
      );
      if (!hasPendingJobs) {
        worker.terminate();
        workerCache.delete(type);
        workerIdleTimers.delete(type);
      } else {
        resetWorkerIdleTimer(type);
      }
    }
  }, WORKER_IDLE_TIMEOUT_MS);

  workerIdleTimers.set(type, timer);
}

function getWorker(type: 'image' | 'audio' | 'video'): Worker {
  const cached = workerCache.get(type);
  if (cached) {
    resetWorkerIdleTimer(type);
    return cached;
  }

  let workerUrl = '';

  if (type === 'image') {
    workerUrl =
      WorkerConfig.imageWorkerUrl ||
      new URL('./workers/image.worker.js', import.meta.url).href;
  } else if (type === 'audio') {
    workerUrl =
      WorkerConfig.audioWorkerUrl ||
      new URL('./workers/audio.worker.js', import.meta.url).href;
  } else {
    workerUrl =
      WorkerConfig.videoWorkerUrl ||
      new URL('./workers/video.worker.js', import.meta.url).href;
  }

  const worker = new Worker(workerUrl, { type: 'module' });

  worker.onmessage = (event: MessageEvent) => {
    const { id, type: msgType, buffer, error, progress } = event.data;
    const job = pendingJobs.get(id);

    if (job) {
      if (msgType === 'progress') {
        job.options.onProgress?.(progress);
        return;
      }

      if (msgType === 'error') {
        job.reject(new Error(error));
      } else if (msgType === 'success') {
        job.resolve(buffer);
      }

      pendingJobs.delete(id);
      resetWorkerIdleTimer(type);

      // Drain the next queued job for this worker type
      drainQueue(type);
    }
  };

  worker.onerror = (error) => {
    logger.error('Worker error:', error);
    workerCache.delete(type);
    workerIdleTimers.delete(type);
    worker.terminate();
  };

  workerCache.set(type, worker);
  resetWorkerIdleTimer(type);
  return worker;
}

// --- Concurrency Queue (#8) ---
// Each worker type processes one job at a time. Heavy-path jobs share a single
// FFmpeg Wasm singleton with fixed VFS filenames, so concurrent dispatch to the
// same worker causes filename collisions and memory spikes. The queue serialises
// dispatch and drains automatically when each job completes.

interface QueuedJob {
  buffer: ArrayBuffer;
  options: CompressorOptions;
  isFastPath: boolean;
  signal?: AbortSignal;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
}

const jobQueues = new Map<'image' | 'audio' | 'video', QueuedJob[]>();
const activeJobs = new Map<'image' | 'audio' | 'video', number>(); // count of in-flight jobs

// One active job per worker — the FFmpeg singleton inside the worker can only
// handle one operation at a time safely.
const MAX_CONCURRENT_PER_TYPE = 1;

function getQueue(type: 'image' | 'audio' | 'video'): QueuedJob[] {
  let q = jobQueues.get(type);
  if (!q) {
    q = [];
    jobQueues.set(type, q);
  }
  return q;
}

function drainQueue(type: 'image' | 'audio' | 'video') {
  const active = activeJobs.get(type) ?? 0;
  const queue = getQueue(type);

  if (active >= MAX_CONCURRENT_PER_TYPE || queue.length === 0) return;

  const next = queue.shift()!;

  // Skip jobs whose signal has already been aborted while they waited in the queue
  if (next.signal?.aborted) {
    next.reject(new AbortError('Compression aborted'));
    drainQueue(type); // Try the next one
    return;
  }

  dispatchToWorker(next.buffer, next.options, next.isFastPath, next.resolve, next.reject, next.signal);
}

function terminateWorker(type: 'image' | 'audio' | 'video') {
  const worker = workerCache.get(type);
  if (worker) {
    worker.terminate();
    workerCache.delete(type);
    const timer = workerIdleTimers.get(type);
    if (timer) {
      clearTimeout(timer);
      workerIdleTimers.delete(type);
    }
  }
}

function dispatchToWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
  resolve: (value: ArrayBuffer) => void,
  reject: (reason: unknown) => void,
  signal?: AbortSignal,
) {
  const id = ++workerIdCounter;
  const worker = getWorker(options.type);
  const type = options.type;

  activeJobs.set(type, (activeJobs.get(type) ?? 0) + 1);

  let abortCleanup: (() => void) | null = null;

  // Wrap resolve/reject to decrement active count and clean up abort listener
  const finalResolve = (value: ArrayBuffer) => {
    abortCleanup?.();
    activeJobs.set(type, Math.max(0, (activeJobs.get(type) ?? 1) - 1));
    resolve(value);
  };
  const finalReject = (reason: unknown) => {
    abortCleanup?.();
    activeJobs.set(type, Math.max(0, (activeJobs.get(type) ?? 1) - 1));
    reject(reason);
  };

  pendingJobs.set(id, { id, options, resolve: finalResolve, reject: finalReject });

  // AbortSignal support (#21): terminate the worker on abort (kills FFmpeg Wasm mid-run),
  // reject the pending promise with AbortError, then drain the queue with a fresh worker.
  if (signal) {
    const onAbort = () => {
      pendingJobs.delete(id);
      terminateWorker(type);
      finalReject(new AbortError('Compression aborted'));
      drainQueue(type);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    abortCleanup = () => signal.removeEventListener('abort', onAbort);
  }

  // Strip functions like `onProgress` because they cannot be cloned via postMessage
  const safeOptions = { ...options };
  delete safeOptions.onProgress;

  logger.debug(`Dispatching job ${id} to ${type} worker (queue depth: ${getQueue(type).length})`);

  // Zero-Copy Memory Transfer: transfer the ArrayBuffer ownership to the worker
  worker.postMessage(
    {
      id,
      buffer,
      options: safeOptions,
      isFastPath,
      ffmpegConfig: {
        coreUrl: WorkerConfig.ffmpegCoreUrl,
        wasmUrl: WorkerConfig.ffmpegWasmUrl,
        workerUrl: WorkerConfig.ffmpegWorkerUrl,
        mtSupported: MT_SUPPORTED,
      },
    },
    [buffer], // Transferable object
  );
}

export function processWithBrowserWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError('Compression aborted'));
      return;
    }

    const type = options.type;
    const active = activeJobs.get(type) ?? 0;

    if (active < MAX_CONCURRENT_PER_TYPE) {
      // Slot available — dispatch immediately
      dispatchToWorker(buffer, options, isFastPath, resolve, reject, signal);
    } else {
      // Queue the job — it will be drained when the current job completes
      logger.debug(`Queueing ${type} job (active: ${active}, queued: ${getQueue(type).length})`);
      getQueue(type).push({ buffer, options, isFastPath, signal, resolve, reject });
    }
  });
}
