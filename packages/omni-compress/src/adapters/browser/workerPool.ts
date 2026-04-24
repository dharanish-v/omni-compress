import type { CompressorOptions } from '../../core/router.js';
import { AbortError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { WorkerConfig } from '../../core/config.js';

let workerIdCounter = 0;

interface WorkerJob {
  id: number;
  options: CompressorOptions;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
  worker: Worker;
}

const pendingJobs = new Map<number, WorkerJob>();

/**
 * Indicates if the current environment supports multi-threaded WebAssembly
 * (requires Cross-Origin Isolation headers / SharedArrayBuffer).
 */
export const MT_SUPPORTED = typeof SharedArrayBuffer !== 'undefined';

// --- Worker Pool ---
// We maintain a pool of workers per type.
// Fast Path tasks can run in parallel (up to hardwareConcurrency).
// Heavy Path (FFmpeg) tasks are serialized per worker instance to avoid VFS collisions.

const workerPools = new Map<'image' | 'audio' | 'video', Worker[]>();
const workerIdleTimers = new Map<Worker, ReturnType<typeof setTimeout>>();

const WORKER_IDLE_TIMEOUT_MS = 60_000; // 60 seconds
const MAX_CONCURRENT_PER_TYPE = Math.min(
  typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
  8,
);

function resetWorkerIdleTimer(worker: Worker, type: 'image' | 'audio' | 'video') {
  const existing = workerIdleTimers.get(worker);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    // Check if this worker has any pending jobs
    const isBusy = Array.from(pendingJobs.values()).some((job) => job.worker === worker);

    if (!isBusy) {
      worker.terminate();
      const pool = workerPools.get(type) || [];
      workerPools.set(
        type,
        pool.filter((w) => w !== worker),
      );
      workerIdleTimers.delete(worker);
    } else {
      resetWorkerIdleTimer(worker, type);
    }
  }, WORKER_IDLE_TIMEOUT_MS);

  workerIdleTimers.set(worker, timer);
}

function getAvailableWorker(type: 'image' | 'audio' | 'video'): Worker {
  const pool = workerPools.get(type) || [];

  // 1. Try to find an idle worker
  const busyWorkers = new Set(Array.from(pendingJobs.values()).map((j) => j.worker));
  const idleWorker = pool.find((w) => !busyWorkers.has(w));

  if (idleWorker) {
    resetWorkerIdleTimer(idleWorker, type);
    return idleWorker;
  }

  // 2. Create new worker if pool not full
  if (pool.length < MAX_CONCURRENT_PER_TYPE) {
    let workerUrl = '';
    if (type === 'image') {
      workerUrl =
        WorkerConfig.imageWorkerUrl || new URL('./workers/image.worker.js', import.meta.url).href;
    } else if (type === 'audio') {
      workerUrl =
        WorkerConfig.audioWorkerUrl || new URL('./workers/audio.worker.js', import.meta.url).href;
    } else {
      workerUrl =
        WorkerConfig.videoWorkerUrl || new URL('./workers/video.worker.js', import.meta.url).href;
    }

    logger.debug(`Spawning ${type} worker: ${workerUrl}`);
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
        resetWorkerIdleTimer(worker, type);
        drainQueue(type);
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      const msg = event.message || '(no message)';
      const loc = event.filename ? ` @ ${event.filename}:${event.lineno}` : '';
      logger.error(`Worker crashed: ${msg}${loc} [url: ${workerUrl}]`);

      // Reject every pending job owned by this worker so callers don't hang.
      for (const [id, job] of pendingJobs) {
        if (job.worker === worker) {
          job.reject(new Error(`Worker crashed: ${msg}`));
          pendingJobs.delete(id);
        }
      }

      const currentPool = workerPools.get(type) || [];
      workerPools.set(
        type,
        currentPool.filter((w) => w !== worker),
      );
      workerIdleTimers.delete(worker);
      worker.terminate();
      drainQueue(type);
    };

    pool.push(worker);
    workerPools.set(type, pool);
    resetWorkerIdleTimer(worker, type);
    return worker;
  }

  // 3. No worker available (must queue)
  throw new Error('No available workers');
}

// --- Concurrency Queue ---

interface QueuedJob {
  data: File | Blob | ArrayBuffer;
  options: CompressorOptions;
  isFastPath: boolean;
  signal?: AbortSignal;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
}

const jobQueues = new Map<'image' | 'audio' | 'video', QueuedJob[]>();

function getQueue(type: 'image' | 'audio' | 'video'): QueuedJob[] {
  let q = jobQueues.get(type);
  if (!q) {
    q = [];
    jobQueues.set(type, q);
  }
  return q;
}

function drainQueue(type: 'image' | 'audio' | 'video') {
  const queue = getQueue(type);
  if (queue.length === 0) return;

  try {
    const worker = getAvailableWorker(type);
    const next = queue.shift()!;

    if (next.signal?.aborted) {
      next.reject(new AbortError('Compression aborted'));
      drainQueue(type);
      return;
    }

    dispatchToWorker(
      worker,
      next.data,
      next.options,
      next.isFastPath,
      next.resolve,
      next.reject,
      next.signal,
    );
  } catch (_e) {
    // No worker available yet, stay in queue
  }
}

function dispatchToWorker(
  worker: Worker,
  data: File | Blob | ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
  resolve: (value: ArrayBuffer) => void,
  reject: (reason: unknown) => void,
  signal?: AbortSignal,
) {
  const id = ++workerIdCounter;
  const type = options.type;

  let abortCleanup: (() => void) | null = null;

  const finalResolve = (value: ArrayBuffer) => {
    abortCleanup?.();
    resolve(value);
  };
  const finalReject = (reason: unknown) => {
    abortCleanup?.();
    reject(reason);
  };

  pendingJobs.set(id, { id, options, resolve: finalResolve, reject: finalReject, worker });

  if (signal) {
    const onAbort = () => {
      pendingJobs.delete(id);
      worker.terminate();
      const pool = workerPools.get(type) || [];
      workerPools.set(
        type,
        pool.filter((w) => w !== worker),
      );
      workerIdleTimers.delete(worker);
      finalReject(new AbortError('Compression aborted'));
      drainQueue(type);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    abortCleanup = () => signal.removeEventListener('abort', onAbort);
  }

  // Strip non-serializable (function) properties before postMessage.
  // beforeDraw / drew are OffscreenCanvas hooks — main-thread only; no-op in workers.
  const safeOptions = { ...options };
  delete safeOptions.onProgress;
  delete safeOptions.beforeDraw;
  delete safeOptions.drew;

  const transfer = data instanceof ArrayBuffer ? [data] : [];

  worker.postMessage(
    {
      id,
      buffer: data,
      options: safeOptions,
      isFastPath,
      ffmpegConfig: {
        coreUrl: WorkerConfig.ffmpegCoreUrl,
        wasmUrl: WorkerConfig.ffmpegWasmUrl,
        workerUrl: WorkerConfig.ffmpegWorkerUrl,
        mtSupported: MT_SUPPORTED,
      },
    },
    transfer as any,
  );
}

export function processWithBrowserWorker(
  data: File | Blob | ArrayBuffer,
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
    const queue = getQueue(type);
    queue.push({ data, options, isFastPath, signal, resolve, reject });
    drainQueue(type);
  });
}
