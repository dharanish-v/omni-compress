import type { CompressorOptions } from '../../core/router.js';
import { logger } from '../../core/logger.js';

let workerIdCounter = 0;

interface WorkerJob {
  id: number;
  options: CompressorOptions;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: any) => void;
}

const pendingJobs = new Map<number, WorkerJob>();

export const WorkerConfig = {
  imageWorkerUrl: '',
  audioWorkerUrl: '',
};

// --- Worker Cache ---
// Workers are cached per type and reused across compression calls.
// Each worker self-terminates after an idle timeout to free memory.

const workerCache = new Map<'image' | 'audio', Worker>();
const workerIdleTimers = new Map<'image' | 'audio', ReturnType<typeof setTimeout>>();

const WORKER_IDLE_TIMEOUT_MS = 60_000; // 60 seconds

function resetWorkerIdleTimer(type: 'image' | 'audio') {
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

function getWorker(type: 'image' | 'audio'): Worker {
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
  } else {
    workerUrl =
      WorkerConfig.audioWorkerUrl ||
      new URL('./workers/audio.worker.js', import.meta.url).href;
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
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: any) => void;
}

const jobQueues = new Map<'image' | 'audio', QueuedJob[]>();
const activeJobs = new Map<'image' | 'audio', number>(); // count of in-flight jobs

// One active job per worker — the FFmpeg singleton inside the worker can only
// handle one operation at a time safely.
const MAX_CONCURRENT_PER_TYPE = 1;

function getQueue(type: 'image' | 'audio'): QueuedJob[] {
  let q = jobQueues.get(type);
  if (!q) {
    q = [];
    jobQueues.set(type, q);
  }
  return q;
}

function drainQueue(type: 'image' | 'audio') {
  const active = activeJobs.get(type) ?? 0;
  const queue = getQueue(type);

  if (active >= MAX_CONCURRENT_PER_TYPE || queue.length === 0) return;

  const next = queue.shift()!;
  dispatchToWorker(next.buffer, next.options, next.isFastPath, next.resolve, next.reject);
}

function dispatchToWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
  resolve: (value: ArrayBuffer) => void,
  reject: (reason: any) => void,
) {
  const id = ++workerIdCounter;
  const worker = getWorker(options.type);
  const type = options.type;

  activeJobs.set(type, (activeJobs.get(type) ?? 0) + 1);

  // Wrap resolve/reject to decrement active count
  const wrappedResolve = (value: ArrayBuffer) => {
    activeJobs.set(type, (activeJobs.get(type) ?? 1) - 1);
    resolve(value);
  };
  const wrappedReject = (reason: any) => {
    activeJobs.set(type, (activeJobs.get(type) ?? 1) - 1);
    reject(reason);
  };

  pendingJobs.set(id, { id, options, resolve: wrappedResolve, reject: wrappedReject });

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
    },
    [buffer], // Transferable object
  );
}

export function processWithBrowserWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const type = options.type;
    const active = activeJobs.get(type) ?? 0;

    if (active < MAX_CONCURRENT_PER_TYPE) {
      // Slot available — dispatch immediately
      dispatchToWorker(buffer, options, isFastPath, resolve, reject);
    } else {
      // Queue the job — it will be drained when the current job completes
      logger.debug(`Queueing ${type} job (active: ${active}, queued: ${getQueue(type).length})`);
      getQueue(type).push({ buffer, options, isFastPath, resolve, reject });
    }
  });
}
