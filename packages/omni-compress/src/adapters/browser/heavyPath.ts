import type { CompressorOptions } from "../../core/router.js";
import { logger } from "../../core/logger.js";

async function createFFmpeg() {
  logger.debug("Initializing FFmpeg Wasm...");
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");

  const ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }: { message: string }) => {
    logger.debug(`[FFmpeg] ${message}`);
  });

  try {
    await ffmpeg.load();
    logger.debug("FFmpeg Wasm loaded successfully.");
    return ffmpeg;
  } catch (err) {
    logger.error("Failed to load FFmpeg Wasm:", err);
    throw err;
  }
}

export async function processImageHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  const ffmpeg = await createFFmpeg();

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

    if (options.format === "webp") {
      args.push("-c:v", "libwebp");
      if (options.quality !== undefined) {
        args.push("-q:v", Math.floor(options.quality * 100).toString());
      }
    } else if (options.format === "avif") {
      args.push("-c:v", "libaom-av1", "-crf", "32");
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
      await ffmpeg.deleteFile(outputFileName);
    } catch (e) {}
    ffmpeg.terminate();
  }
}

export async function processAudioHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  const ffmpeg = await createFFmpeg();

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
      } catch (e) {}

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
        "128k",
        "-compression_level",
        "0",
        "-frame_duration",
        "20",
        "-application",
        "audio",
        opusOutputFile,
      ];
      const encodeCode = await ffmpeg.exec(encodeArgs);
      if (encodeCode !== 0)
        throw new Error(`FFmpeg Opus encoding failed (code ${encodeCode}).`);

      try {
        await ffmpeg.deleteFile(intermediateFile);
      } catch (e) {}

      const resultData = (await ffmpeg.readFile(opusOutputFile)) as Uint8Array;
      try {
        await ffmpeg.deleteFile(opusOutputFile);
      } catch (e) {}
      return resultData.slice().buffer;
    } else {
      // ROBUST ARGUMENTS:
      // -nostdin: Non-interactive
      // -threads 1: Stability in Wasm
      // -i: Input
      // -map 0:a: ONLY audio. Ignore album art MJPEG which causes OOM.
      // -map_metadata -1: Strip metadata to save space.
      const args = [
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
      ];

      if (options.format === "mp3") {
        args.push("-c:a", "libmp3lame", "-b:a", "128k");
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
      await ffmpeg.deleteFile(outputFileName);
    } catch (e) {}
    ffmpeg.terminate();
  }
}
