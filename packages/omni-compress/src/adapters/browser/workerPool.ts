import type { CompressorOptions } from '../../core/router.js';

let workerIdCounter = 0;

interface WorkerJob {
  id: number;
  options: CompressorOptions;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: any) => void;
}

const pendingJobs = new Map<number, WorkerJob>();

function getWorker(type: 'image' | 'audio'): Worker {
  // In a real production scenario, we'd pool these. For now, we spawn on demand or reuse a singleton.
  let workerUrl = '';
  // When compiled via tsup to the `dist` folder, the worker files end up in `dist/workers/*`
  // and this code runs from `dist/chunk-*` or `dist/index.js`.
  if (type === 'image') {
    workerUrl = new URL('./workers/image.worker.js', import.meta.url).href;
  } else {
    workerUrl = new URL('./workers/audio.worker.js', import.meta.url).href;
  }

  const worker = new Worker(workerUrl, { type: 'module' });

  worker.onmessage = (event: MessageEvent) => {
    const { id, type, buffer, error, progress } = event.data;
    const job = pendingJobs.get(id);
    
    if (job) {
      if (type === 'progress') {
        job.options.onProgress?.(progress);
        return;
      }

      if (type === 'error') {
        job.reject(new Error(error));
      } else if (type === 'success') {
        job.resolve(buffer);
      }
      
      pendingJobs.delete(id);
      worker.terminate(); // Kill worker after job to free memory
    }
  };

  worker.onerror = (error) => {
    console.error('Worker error:', error);
    worker.terminate();
  };

  return worker;
}

export function processWithBrowserWorker(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  isFastPath: boolean
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
        isFastPath
      },
      [buffer] // Transferable object
    );
  });
}
