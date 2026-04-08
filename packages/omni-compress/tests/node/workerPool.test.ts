import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// MockWorker — simulates browser Worker API
// ---------------------------------------------------------------------------
class MockWorker {
  static instances: MockWorker[] = [];

  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((error: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWorker.instances.push(this);
  }

  /** Simulate the worker sending a success message back. */
  simulateSuccess(id: number, buffer: ArrayBuffer) {
    this.onmessage?.({ data: { id, type: 'success', buffer } } as MessageEvent);
  }

  /** Simulate the worker sending an error message back. */
  simulateError(id: number, errorMsg: string) {
    this.onmessage?.({ data: { id, type: 'error', error: errorMsg } } as MessageEvent);
  }

  /** Simulate the worker sending a progress message. */
  simulateProgress(id: number, progress: number) {
    this.onmessage?.({ data: { id, type: 'progress', progress } } as MessageEvent);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('processWithBrowserWorker', () => {
  let processWithBrowserWorker: typeof import('../../src/adapters/browser/workerPool').processWithBrowserWorker;

  beforeEach(async () => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    // Also stub navigator for hardwareConcurrency
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
    vi.stubGlobal('SharedArrayBuffer', ArrayBuffer);

    // Re-import the module fresh each test to reset module-level state
    vi.resetModules();
    const mod = await import('../../src/adapters/browser/workerPool.js');
    processWithBrowserWorker = mod.processWithBrowserWorker;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves with ArrayBuffer on worker success', async () => {
    const options = { type: 'image' as const, format: 'webp' };
    const data = new Blob([new Uint8Array([1, 2, 3])]);

    const promise = processWithBrowserWorker(data, options, false);

    // Simulate worker responding
    const worker = MockWorker.instances[0];
    expect(worker).toBeDefined();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    // Get the job id from the postMessage call
    const { id } = worker.postMessage.mock.calls[0][0] as { id: number };
    const resultBuffer = new ArrayBuffer(10);
    worker.simulateSuccess(id, resultBuffer);

    const result = await promise;
    expect(result).toBe(resultBuffer);
  });

  it('rejects with Error on worker error', async () => {
    const options = { type: 'audio' as const, format: 'mp3' };
    const data = new Blob([]);

    const promise = processWithBrowserWorker(data, options, false);

    const worker = MockWorker.instances[0];
    const { id } = worker.postMessage.mock.calls[0][0] as { id: number };
    worker.simulateError(id, 'FFmpeg crashed');

    await expect(promise).rejects.toThrow('FFmpeg crashed');
  });

  it('fires onProgress for progress messages', async () => {
    const progressFn = vi.fn();
    const options = { type: 'image' as const, format: 'webp', onProgress: progressFn };
    const data = new Blob([]);

    const promise = processWithBrowserWorker(data, options, false);
    const worker = MockWorker.instances[0];
    const { id } = worker.postMessage.mock.calls[0][0] as { id: number };

    worker.simulateProgress(id, 50);
    expect(progressFn).toHaveBeenCalledWith(50);

    const buf = new ArrayBuffer(5);
    worker.simulateSuccess(id, buf);
    await promise;
  });

  it('rejects immediately when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const options = { type: 'image' as const, format: 'webp' };
    const data = new Blob([]);

    await expect(
      processWithBrowserWorker(data, options, false, controller.signal),
    ).rejects.toThrow('Compression aborted');
  });

  it('terminates worker and rejects on mid-flight abort', async () => {
    const controller = new AbortController();
    const options = { type: 'video' as const, format: 'mp4' };
    const data = new Blob([]);

    const promise = processWithBrowserWorker(data, options, false, controller.signal);
    const worker = MockWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    // Abort mid-flight
    controller.abort();

    await expect(promise).rejects.toThrow('Compression aborted');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('reuses existing idle worker for second job', async () => {
    const options = { type: 'image' as const, format: 'webp' };

    // Job 1
    const p1 = processWithBrowserWorker(new Blob([]), options, false);
    const worker1 = MockWorker.instances[0];
    const { id: id1 } = worker1.postMessage.mock.calls[0][0] as { id: number };
    worker1.simulateSuccess(id1, new ArrayBuffer(4));
    await p1;

    const instanceCountAfterFirst = MockWorker.instances.length;

    // Job 2 — should reuse worker1 (it's now idle)
    const p2 = processWithBrowserWorker(new Blob([]), options, false);
    const { id: id2 } = worker1.postMessage.mock.calls[1][0] as { id: number };
    worker1.simulateSuccess(id2, new ArrayBuffer(4));
    await p2;

    // No new Worker created for the second job
    expect(MockWorker.instances.length).toBe(instanceCountAfterFirst);
  });

  it('passes ArrayBuffer as transferable', async () => {
    const options = { type: 'image' as const, format: 'webp' };
    const buffer = new ArrayBuffer(8);

    const promise = processWithBrowserWorker(buffer, options, false);
    const worker = MockWorker.instances[0];
    const call = worker.postMessage.mock.calls[0];
    const transferList = call[1] as ArrayBuffer[];

    // ArrayBuffer should be in the transfer list (zero-copy)
    expect(transferList).toContain(buffer);

    const { id } = call[0] as { id: number };
    worker.simulateSuccess(id, new ArrayBuffer(4));
    await promise;
  });
});
