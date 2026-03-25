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

export function processWithBrowserWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = ++workerIdCounter;
    const worker = getWorker(options.type);

    pendingJobs.set(id, { id, options, resolve, reject });

    // Strip functions like `onProgress` because they cannot be cloned via postMessage
    const safeOptions = { ...options };
    delete safeOptions.onProgress;

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
  });
}
