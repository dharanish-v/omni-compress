import { describe, it, expect, vi, beforeEach } from "vitest";
import { OmniCompressor } from "./index";

// Mock Worker
class MockWorker {
  onmessage: (e: any) => void = () => {};
  postMessage = vi.fn((data: any) => {
    // Simulate worker response
    setTimeout(() => {
      if (data.type === "init") {
        this.onmessage({ data: { id: data.id, type: "success" } });
      } else if (data.type === "compress_image") {
        this.onmessage({
          data: {
            id: data.id,
            type: "success",
            payload: new Uint8Array([1, 2, 3]),
          },
        });
      }
    }, 10);
  });
  terminate = vi.fn();
}

vi.stubGlobal("Worker", MockWorker);

describe("OmniCompressor", () => {
  let compressor: OmniCompressor;

  beforeEach(() => {
    compressor = new OmniCompressor();
  });

  it("should initialize successfully", async () => {
    await expect(compressor.init()).resolves.toBeUndefined();
  });

  it("should compress an image", async () => {
    await compressor.init();
    const mockData = new Uint8Array([0, 0, 0]);
    const result = await compressor.compressImage(mockData, 100, 75);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(3);
  });

  it("should terminate the worker", () => {
    compressor.terminate();
    // Verify terminate was called on the mock worker
    // @ts-ignore
    expect(compressor.worker.terminate).toHaveBeenCalled();
  });
});
