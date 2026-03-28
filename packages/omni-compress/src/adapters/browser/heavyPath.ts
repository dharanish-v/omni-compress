import type { CompressorOptions } from "../../core/router.js";
import { SAFE_SIZE_LIMITS } from "../../core/utils.js";
import { logger } from "../../core/logger.js";

// --- FFmpeg Singleton (ST — single-threaded core) ---
// Reuses a single FFmpeg Wasm instance across compressions within the same
// Web Worker, cleaning only the Virtual File System between calls.
// The instance self-terminates after an idle timeout to free Wasm memory.

let singletonFFmpeg: any = null;
let singletonPromise: Promise<any> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT_MS = 30_000; // 30 seconds

function resetIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    if (singletonFFmpeg) {
      logger.debug("FFmpeg idle timeout reached. Terminating singleton.");
      try {
        singletonFFmpeg.terminate();
      } catch (_e) {
        // Already terminated or never fully loaded
      }
      singletonFFmpeg = null;
      singletonPromise = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function getFFmpeg() {
  if (singletonFFmpeg) {
    resetIdleTimer();
    return singletonFFmpeg;
  }

  if (singletonPromise) {
    return singletonPromise;
  }

  singletonPromise = (async () => {
    logger.debug("Initializing FFmpeg Wasm singleton...");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }: { message: string }) => {
      logger.debug(`[FFmpeg] ${message}`);
    });

    try {
      await ffmpeg.load();
      logger.debug("FFmpeg Wasm singleton loaded successfully.");
      singletonFFmpeg = ffmpeg;
      resetIdleTimer();
      return ffmpeg;
    } catch (err) {
      logger.error("Failed to load FFmpeg Wasm:", err);
      singletonPromise = null;
      throw err;
    }
  })();

  return singletonPromise;
}

export async function processImageHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe Wasm limit (250 MB). ` +
        `Refusing to load into FFmpeg to prevent memory exhaustion.`,
    );
  }

  const ffmpeg = await getFFmpeg();

  const ext =
    options.originalFileName?.split(".").pop()?.toLowerCase() || "img";
  const inputFileName = `input.${ext}`;
  const outputFileName = `output.${options.format}`;

  const fileData = new Uint8Array(buffer);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress * 100);
  };

  try {
    ffmpeg.on("progress", progressHandler);
    await ffmpeg.writeFile(inputFileName, fileData);

    // -map 0:v:0: Select only the first video stream
    const args = ["-i", inputFileName, "-map", "0:v:0"];

    if (!options.preserveMetadata) {
      args.push("-map_metadata", "-1");
    }

    if (options.maxWidth || options.maxHeight) {
      const w = options.maxWidth || -1;
      const h = options.maxHeight || -1;
      args.push("-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    }

    // AVIF is handled by @jsquash/avif in image.worker.ts — never reaches here.
    if (options.format === "webp") {
      args.push("-c:v", "libwebp");
      if (options.quality !== undefined) {
        args.push("-q:v", Math.floor(options.quality * 100).toString());
      }
    }

    args.push(outputFileName);

    const code = await ffmpeg.exec(args);
    if (code !== 0)
      throw new Error(`FFmpeg image conversion failed (code ${code}).`);

    const resultData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    return resultData.slice().buffer; // Copy out of Wasm heap
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_e) {}
    resetIdleTimer();
  }
}

export async function processAudioHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  if (buffer.byteLength > SAFE_SIZE_LIMITS.browser) {
    throw new Error(
      `Buffer size (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds safe Wasm limit (250 MB). ` +
        `Refusing to load into FFmpeg to prevent memory exhaustion.`,
    );
  }

  const ffmpeg = await getFFmpeg();

  const ext =
    options.originalFileName?.split(".").pop()?.toLowerCase() || "audio";
  const inputFileName = `input.${ext}`;
  const outputFileName = `output.${options.format}`;

  const fileData = new Uint8Array(buffer);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(progress * 100);
  };

  try {
    ffmpeg.on("progress", progressHandler);
    await ffmpeg.writeFile(inputFileName, fileData);

    if (options.format === "opus") {
      // Two-pass approach for Opus to avoid "memory access out of bounds" in
      // the single-threaded @ffmpeg/core WASM build:
      //   1. The raw 'opus' muxer (output.opus) is unstable in this build.
      //      Using the OGG muxer (.ogg) with '-c:a libopus' is safer.
      //   2. Resampling to 48kHz AND encoding in a single exec can cause
      //      peak memory spikes that exceed WASM linear memory bounds.
      //      Splitting into resample + encode avoids this.
      const intermediateFile = "resampled.wav";
      // Use OGG container — the raw 'opus' muxer crashes in this WASM build
      const opusOutputFile = "output.ogg";

      // Pass 1: Resample to 48kHz PCM (no encoding overhead)
      const resampleArgs = [
        "-nostdin",
        "-y",
        "-threads",
        "1",
        "-i",
        inputFileName,
        "-map",
        "0:a",
        "-map_metadata",
        "-1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        intermediateFile,
      ];
      const resampleCode = await ffmpeg.exec(resampleArgs);
      if (resampleCode !== 0)
        throw new Error(
          `FFmpeg audio resampling failed (code ${resampleCode}).`,
        );

      // Free input from WASM FS before encoding to reduce WASM heap pressure
      try {
        await ffmpeg.deleteFile(inputFileName);
      } catch (_e) {}

      // Pass 2: Encode resampled audio to Opus via OGG muxer
      const encodeArgs = [
        "-nostdin",
        "-y",
        "-threads",
        "1",
        "-i",
        intermediateFile,
        "-c:a",
        "libopus",
        "-b:a",
        options.bitrate || "128k",
        "-compression_level",
        "0",
        "-frame_duration",
        "20",
        "-application",
        "audio",
      ];

      if (options.channels) encodeArgs.push("-ac", options.channels.toString());
      encodeArgs.push(opusOutputFile);

      const encodeCode = await ffmpeg.exec(encodeArgs);
      if (encodeCode !== 0)
        throw new Error(`FFmpeg Opus encoding failed (code ${encodeCode}).`);

      try {
        await ffmpeg.deleteFile(intermediateFile);
      } catch (_e) {}

      const resultData = (await ffmpeg.readFile(opusOutputFile)) as Uint8Array;
      try {
        await ffmpeg.deleteFile(opusOutputFile);
      } catch (_e) {}
      return resultData.slice().buffer;
    } else {
      // ROBUST ARGUMENTS:
      // -nostdin: Non-interactive
      // -threads 1: Stability in Wasm
      // -i: Input
      // -map 0:a: ONLY audio. Ignore album art MJPEG which causes OOM.
      const args = [
        "-nostdin",
        "-y",
        "-threads",
        "1",
        "-i",
        inputFileName,
        "-map",
        "0:a",
      ];

      if (!options.preserveMetadata) {
        args.push("-map_metadata", "-1");
      }

      if (options.channels) args.push("-ac", options.channels.toString());
      if (options.sampleRate) args.push("-ar", options.sampleRate.toString());

      if (options.format === "mp3") {
        args.push("-c:a", "libmp3lame", "-b:a", options.bitrate || "128k");
      } else if (options.format === "flac") {
        args.push("-c:a", "flac");
      }

      args.push(outputFileName);

      const code = await ffmpeg.exec(args);
      if (code !== 0)
        throw new Error(`FFmpeg audio conversion failed (code ${code}).`);
    }

    const resultData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    return resultData.slice().buffer; // Copy out of Wasm heap
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputFileName);
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (_e) {}
    resetIdleTimer();
  }
}
