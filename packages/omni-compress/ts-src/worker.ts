import init, { compress_image, compress_zlib, compress_to_flac, compress_to_mp3 } from "../pkg/omni_compress.js";

let initialized = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, id, payload } = e.data;

  try {
    if (!initialized) {
      await init();
      initialized = true;
    }

    if (type === "init") {
      self.postMessage({ id, type: "success" });
      return;
    }

    let result;
    if (type === "compress_image") {
      const { data, maxWidth, quality } = payload;
      result = compress_image(data, maxWidth, quality);
    } else if (type === "compress_zlib") {
      const { data, level } = payload;
      result = compress_zlib(data, level);
    } else if (type === "compress_audio_flac") {
      const { data, sampleRate, channels, bitsPerSample } = payload;
      result = compress_to_flac(data, sampleRate, channels, bitsPerSample);
    } else if (type === "compress_audio_mp3") {
      const { data, sampleRate, channels, bitrate } = payload;
      result = compress_to_mp3(data, sampleRate, channels, bitrate);
    }

    // Transferable objects (ArrayBuffer) for performance
    if (result instanceof Uint8Array) {
      self.postMessage({ id, type: "success", payload: result }, { transfer: [result.buffer] });
    } else if (result instanceof Float32Array) {
      self.postMessage({ id, type: "success", payload: result }, { transfer: [result.buffer] });
    } else {
      self.postMessage({ id, type: "success", payload: result });
    }
  } catch (err: any) {
    self.postMessage({ id, type: "error", error: err.message || String(err) });
  }
};
