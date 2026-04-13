import type { CompressorOptions } from '../../core/router.js';
import { getMimeType } from '../../core/utils.js';

/**
 * FAST PATH: Image Processing
 * Uses OffscreenCanvas for hardware-accelerated image conversion.
 *
 * Accepts `Blob | ArrayBuffer` to avoid the unnecessary Blob→ArrayBuffer→Blob
 * round-trip when the caller already has a Blob (main-thread zero-copy path).
 * ArrayBuffer is only materialised when resize header parsing is required.
 */
export async function processImageFastPath(
  input: ArrayBuffer | Blob,
  options: CompressorOptions,
): Promise<ArrayBuffer> {
  // Use the Blob directly when available — avoids a full data copy.
  const blob = input instanceof Blob ? input : new Blob([input]);

  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  // 1. Pre-calculate target dimensions for resize.
  // Read pixel dimensions from the raw file header (zero-decode, ~1µs) to avoid
  // the previous double-decode pattern (two createImageBitmap calls).
  if (options.maxWidth || options.maxHeight) {
    // Header parsing needs an ArrayBuffer — materialise lazily only here.
    const buffer = input instanceof ArrayBuffer ? input : await blob.arrayBuffer();
    const dims = getImageDimensionsFromHeader(buffer);
    if (dims) {
      const { width: origW, height: origH } = dims;
      const ratio = origW / origH;
      targetWidth = origW;
      targetHeight = origH;

      if (options.maxWidth && targetWidth > options.maxWidth) {
        targetWidth = options.maxWidth;
        targetHeight = Math.floor(targetWidth / ratio);
      }
      if (options.maxHeight && targetHeight > options.maxHeight) {
        targetHeight = options.maxHeight;
        targetWidth = Math.floor(targetHeight * ratio);
      }
      targetWidth = Math.floor(targetWidth);
    } else {
      // Fallback: single probe decode (header parse failed — non-standard format)
      const tempBitmap = await createImageBitmap(blob);
      const ratio = tempBitmap.width / tempBitmap.height;
      targetWidth = tempBitmap.width;
      targetHeight = tempBitmap.height;
      tempBitmap.close();

      if (options.maxWidth && targetWidth > options.maxWidth) {
        targetWidth = options.maxWidth;
        targetHeight = Math.floor(targetWidth / ratio);
      }
      if (options.maxHeight && targetHeight > options.maxHeight) {
        targetHeight = options.maxHeight;
        targetWidth = Math.floor(targetHeight * ratio);
      }
    }
  }

  // 2. Decode (and resize if needed) in a single pass using the browser's GPU decoder
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  });

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for OffscreenCanvas');

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const mimeType = getMimeType(options.type, options.format);
  const outBlob = await canvas.convertToBlob({
    type: mimeType,
    quality: options.quality ?? 0.8,
  });

  return await outBlob.arrayBuffer();
}

/**
 * Zero-copy variant for main-thread use: returns the Blob directly from
 * OffscreenCanvas.convertToBlob() without the Blob→ArrayBuffer→Blob round-trip
 * that the worker path requires for postMessage transfer.
 */
export async function processImageFastPathToBlob(
  input: ArrayBuffer | Blob,
  options: CompressorOptions,
): Promise<Blob> {
  const blob = input instanceof Blob ? input : new Blob([input]);
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  if (options.maxWidth || options.maxHeight) {
    const buffer = input instanceof ArrayBuffer ? input : await blob.arrayBuffer();
    const dims = getImageDimensionsFromHeader(buffer);
    if (dims) {
      const { width: origW, height: origH } = dims;
      const ratio = origW / origH;
      targetWidth = origW;
      targetHeight = origH;
      if (options.maxWidth && targetWidth > options.maxWidth) {
        targetWidth = options.maxWidth;
        targetHeight = Math.floor(targetWidth / ratio);
      }
      if (options.maxHeight && targetHeight > options.maxHeight) {
        targetHeight = options.maxHeight;
        targetWidth = Math.floor(targetHeight * ratio);
      }
      targetWidth = Math.floor(targetWidth);
    } else {
      const tempBitmap = await createImageBitmap(blob);
      const ratio = tempBitmap.width / tempBitmap.height;
      targetWidth = tempBitmap.width;
      targetHeight = tempBitmap.height;
      tempBitmap.close();
      if (options.maxWidth && targetWidth > options.maxWidth) {
        targetWidth = options.maxWidth;
        targetHeight = Math.floor(targetWidth / ratio);
      }
      if (options.maxHeight && targetHeight > options.maxHeight) {
        targetHeight = options.maxHeight;
        targetWidth = Math.floor(targetHeight * ratio);
      }
    }
  }

  const bitmap = await createImageBitmap(blob, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  });

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for OffscreenCanvas');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const mimeType = getMimeType(options.type, options.format);
  return canvas.convertToBlob({ type: mimeType, quality: options.quality ?? 0.8 });
}

/**
 * FAST PATH: Audio Processing (WebCodecs)
 * Decodes input audio via AudioDecoder and re-encodes it via AudioEncoder.
 */
export async function processAudioFastPath(
  buffer: ArrayBuffer,
  options: CompressorOptions,
): Promise<ArrayBuffer> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') {
    throw new Error('WebCodecs API not supported in this environment.');
  }

  // 1. Decode input buffer to raw AudioData chunks
  const audioDataChunks = await decodeAudio(buffer);
  if (audioDataChunks.length === 0) {
    throw new Error('Failed to decode any audio data from input.');
  }

  const firstChunk = audioDataChunks[0];
  const sampleRate = firstChunk.sampleRate;
  const numberOfChannels = firstChunk.numberOfChannels;

  // 2. Encode PCM data to target format
  const isAAC = options.format.toLowerCase() === 'aac';

  // Note: Standard WebCodecs output format for AAC is raw frames (needing ADTS headers for playback)
  // For Opus, it typically outputs Ogg Opus packets.

  return new Promise((resolve, reject) => {
    const encodedChunks: Uint8Array[] = [];

    const encoder = new AudioEncoder({
      output: (chunk) => {
        const body = new Uint8Array(chunk.byteLength);
        chunk.copyTo(body);

        if (isAAC) {
          // AAC requires ADTS headers per frame for a standalone file
          const header = createAdtsHeader(sampleRate, numberOfChannels, chunk.byteLength);
          const frame = new Uint8Array(header.length + body.length);
          frame.set(header);
          frame.set(body, header.length);
          encodedChunks.push(frame);
        } else {
          // For Opus, we currently provide the raw packets
          // Full Ogg encapsulation is complex; if raw packets aren't enough, fallback to Heavy Path
          encodedChunks.push(body);
        }
      },
      error: (e) => reject(e),
    });

    const encoderConfig: AudioEncoderConfig = {
      codec: isAAC ? 'mp4a.40.2' : 'opus', // AAC-LC or Opus
      sampleRate,
      numberOfChannels,
      bitrate: parseBitrate(options.bitrate) || 128_000,
    };

    try {
      encoder.configure(encoderConfig);

      for (const chunk of audioDataChunks) {
        encoder.encode(chunk);
        chunk.close(); // Critical: Free memory immediately
      }

      void encoder.flush().then(() => {
        encoder.close();
        const totalLength = encodedChunks.reduce((acc, c) => acc + c.length, 0);
        const finalBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of encodedChunks) {
          finalBuffer.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(finalBuffer.buffer);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * FAST PATH: Video Processing (WebCodecs)
 * Hardware-accelerated video encoding via VideoEncoder.
 *
 * Note: Video processing is complex due to container muxing (MP4/WebM).
 * Full implementation pending. Currently routes to Heavy Path.
 */
export async function processVideoFastPath(
  _buffer: ArrayBuffer,
  _options: CompressorOptions,
): Promise<ArrayBuffer> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs Video API not supported in this environment.');
  }

  // Placeholder for WebCodecs Video Pipeline:
  // 1. Demux input container (MP4/WebM)
  // 2. Decode video stream to VideoFrame objects
  // 3. Re-encode VideoFrames via VideoEncoder
  // 4. Mux encoded chunks back into target container

  throw new Error(
    'Video Fast Path (WebCodecs) pending implementation. Routing to Heavy Path (FFmpeg).',
  );
}

/**
 * Decodes any browser-supported audio format to AudioData chunks.
 * Note: Uses a temporary decoder to handle the raw buffer.
 */
async function decodeAudio(buffer: ArrayBuffer): Promise<AudioData[]> {
  // WebCodecs decoding usually requires an encapsulated stream (MP4/WebM)
  // For raw bitstreams, we'd need a demuxer.
  // HOWEVER, many browsers allow decoding via AudioContext.decodeAudioData
  // but AudioContext is not available in Workers.

  // Strategy: If input is WAV, use our demuxer. Otherwise, throw to fallback.
  // Full cross-format decoding in Workers is usually best handled by FFmpeg (Heavy Path).
  const info = isWav(buffer) ? demuxWav(buffer) : null;
  if (!info) {
    throw new Error(
      'Worker-side decoding only supported for WAV in Fast Path. Redirecting to Heavy Path.',
    );
  }

  // For WAV, we can skip decoding and create AudioData directly from PCM
  // This implementation assumes 16-bit integer PCM (standard WAV)
  const pcmData = new Int16Array(buffer, info.dataOffset);
  const totalSamples = pcmData.length / info.channels;

  const audioData = new AudioData({
    format: 's16', // Signed 16-bit
    sampleRate: info.sampleRate,
    numberOfFrames: totalSamples,
    numberOfChannels: info.channels,
    timestamp: 0,
    data: pcmData,
  });

  return [audioData];
}

function isWav(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return false;
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );
  return riff === 'RIFF' && wave === 'WAVE';
}

function parseBitrate(bitrate?: string): number | null {
  if (!bitrate) return null;
  const match = bitrate.match(/^(\d+)(k?)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return match[2].toLowerCase() === 'k' ? val * 1000 : val;
}

/**
 * Ultra-lightweight WAV Demuxer
 * Parses RIFF/WAVE header to extract sample rate and channel count.
 */
function demuxWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);

  // Verify RIFF/WAVE signature
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );

  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file structure');
  }

  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataOffset: 44, // Standard header length
  };
}

/**
 * Zero-decode image dimension parser.
 * Reads width/height from raw file header bytes (~1µs, no GPU involvement).
 * Supports JPEG (SOF0/SOF2), PNG (IHDR), and WebP (VP8/VP8L/VP8X).
 * Returns null for unknown formats — caller falls back to probe decode.
 */
function getImageDimensionsFromHeader(
  buffer: ArrayBuffer,
): { width: number; height: number } | null {
  const view = new DataView(buffer);
  const len = buffer.byteLength;

  // PNG: signature 0x89504E47 at byte 0; IHDR width/height at bytes 16–23
  if (len >= 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: starts with FF D8; scan for SOF0 (FFC0), SOF2 (FFC2), SOF1 (FFC1)
  if (len >= 4 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
    let offset = 2;
    while (offset + 8 < len) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      // SOF0=0xC0, SOF1=0xC1, SOF2=0xC2 (progressive): height at +5, width at +7
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      // Skip this segment (marker + 2-byte length field)
      if (offset + 3 >= len) break;
      const segLen = view.getUint16(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF????WEBP at bytes 0–11
  if (
    len >= 30 &&
    view.getUint32(0) === 0x52494646 && // 'RIFF'
    view.getUint32(8) === 0x57454250 // 'WEBP'
  ) {
    const chunkType = String.fromCharCode(
      view.getUint8(12),
      view.getUint8(13),
      view.getUint8(14),
      view.getUint8(15),
    );
    if (chunkType === 'VP8 ' && len >= 30) {
      // VP8 lossy: width at bytes 26–27 (14-bit, mask 0x3FFF), height at 28–29
      const w = view.getUint16(26, true) & 0x3fff;
      const h = view.getUint16(28, true) & 0x3fff;
      return { width: w, height: h };
    }
    if (chunkType === 'VP8L' && len >= 25) {
      // VP8 lossless: 4 bytes at offset 21, fields are 14-bit each
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunkType === 'VP8X' && len >= 34) {
      // VP8X extended: canvas width-1 at bytes 24–26 (24-bit LE), height-1 at 27–29
      const w = (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1;
      const h = (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1;
      return { width: w, height: h };
    }
  }

  return null;
}

/**
 * AAC ADTS Header Generator
 * Creates the 7-byte header required for every AAC frame.
 * Reference: ISO/IEC 13818-7
 */
function createAdtsHeader(sampleRate: number, channels: number, frameLength: number): Uint8Array {
  const samplingFrequencies = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
  ];
  const freqIdx = samplingFrequencies.indexOf(sampleRate);
  const fullLength = frameLength + 7;
  const header = new Uint8Array(7);

  header[0] = 0xff; // Sync word (12 bits)
  header[1] = 0xf1; // Sync word + Layer + Protection
  header[2] = (1 << 6) | (freqIdx << 2) | (channels >> 2);
  header[3] = ((channels & 3) << 6) | (fullLength >> 11);
  header[4] = (fullLength & 0x7ff) >> 3;
  header[5] = ((fullLength & 7) << 5) | 0x1f;
  header[6] = 0xfc;

  return header;
}
