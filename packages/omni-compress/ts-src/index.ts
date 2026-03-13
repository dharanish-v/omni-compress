export class OmniCompressor {
  private worker: Worker;
  private pending: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor(workerUrl?: string | URL) {
    // Default to the worker.js in the same directory
    const url = workerUrl || new URL("./worker.js", import.meta.url);
    this.worker = new Worker(url, { type: "module" });

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, type, payload, error } = e.data;
      const handlers = this.pending.get(id);
      if (!handlers) return;

      if (type === "success") {
        handlers.resolve(payload);
      } else {
        handlers.reject(new Error(error));
      }
      this.pending.delete(id);
    };
  }

  private send(type: string, payload?: any): Promise<any> {
    const id = Math.random().toString(36).substring(7);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Identify transferable objects to speed up communication
      const transfer = payload?.data instanceof Uint8Array ? [payload.data.buffer] : [];
      this.worker.postMessage({ id, type, payload }, { transfer });
    });
  }

  /**
   * Initialize the WASM module in the worker.
   */
  async init(): Promise<void> {
    return this.send("init");
  }

  /**
   * Compress an image asynchronously in a background thread.
   */
  async compressImage(data: Uint8Array, maxWidth: number, quality: number): Promise<Uint8Array> {
    return this.send("compress_image", { data, maxWidth, quality });
  }

  /**
   * Compress data with Zlib asynchronously in a background thread.
   */
  async compressZlib(data: Uint8Array, level: number): Promise<Uint8Array> {
    return this.send("compress_zlib", { data, level });
  }

  /**
   * Compress audio to FLAC asynchronously in a background thread.
   * @param data Raw f32 PCM data (interleaved)
   */
  async compressAudioFlac(data: Float32Array, sampleRate: number, channels: number, bitsPerSample: number): Promise<Uint8Array> {
    return this.send("compress_audio_flac", { data, sampleRate, channels, bitsPerSample });
  }

  /**
   * Compress audio to MP3 asynchronously in a background thread.
   * @param data Raw f32 PCM data (interleaved)
   */
  async compressAudioMp3(data: Float32Array, sampleRate: number, channels: number, bitrate: number): Promise<Uint8Array> {
    return this.send("compress_audio_mp3", { data, sampleRate, channels, bitrate });
  }

  /**
   * Terminate the worker and free resources.
   */
  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
