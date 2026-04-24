import type { CompressorOptions } from '../../core/router.js';
import { getMimeType, getImageDimensionsFromHeader } from '../../core/utils.js';

// ---------------------------------------------------------------------------
// Dimension computation (Gaps #1-3: minWidth/minHeight, width/height, resize)
// ---------------------------------------------------------------------------

interface DrawParams {
  canvasW: number;
  canvasH: number;
  // Source rectangle in bitmap (original pixel) coordinates
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  // Destination rectangle in canvas coordinates
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Computes canvas dimensions and drawImage source/dest rectangles from
 * the original image dimensions and all constraint options.
 *
 * Processing order:
 *  1. maxWidth / maxHeight — ceiling downscale (aspect-ratio preserving)
 *  2. minWidth / minHeight — floor upscale (aspect-ratio preserving)
 *  3. width / height + resize mode — exact canvas dimensions with fitting
 */
function computeDrawParams(origW: number, origH: number, opts: CompressorOptions): DrawParams {
  let tw = origW;
  let th = origH;

  // Step 1: ceiling downscale
  if (opts.maxWidth && tw > opts.maxWidth) {
    th = Math.round((th * opts.maxWidth) / tw);
    tw = opts.maxWidth;
  }
  if (opts.maxHeight && th > opts.maxHeight) {
    tw = Math.round((tw * opts.maxHeight) / th);
    th = opts.maxHeight;
  }

  // Step 2: floor upscale
  if (opts.minWidth && tw < opts.minWidth) {
    th = Math.round((th * opts.minWidth) / tw);
    tw = opts.minWidth;
  }
  if (opts.minHeight && th < opts.minHeight) {
    tw = Math.round((tw * opts.minHeight) / th);
    th = opts.minHeight;
  }

  // Step 3: exact canvas size with resize mode
  if (opts.width || opts.height) {
    const cW = opts.width ?? tw;
    const cH = opts.height ?? th;
    const mode = opts.resize ?? 'contain';

    if (mode === 'none') {
      // Canvas is cW×cH; image drawn at current (tw×th) size from top-left, may clip
      return {
        canvasW: cW,
        canvasH: cH,
        sx: 0,
        sy: 0,
        sw: origW,
        sh: origH,
        dx: 0,
        dy: 0,
        dw: tw,
        dh: th,
      };
    }

    if (mode === 'contain') {
      // Scale tw×th to fit inside cW×cH, centred
      const scale = Math.min(cW / tw, cH / th);
      const dw = Math.round(tw * scale);
      const dh = Math.round(th * scale);
      return {
        canvasW: cW,
        canvasH: cH,
        sx: 0,
        sy: 0,
        sw: origW,
        sh: origH,
        dx: Math.round((cW - dw) / 2),
        dy: Math.round((cH - dh) / 2),
        dw,
        dh,
      };
    }

    // 'cover': scale to fill cW×cH, crop the overflow from the centre
    const scale = Math.max(cW / tw, cH / th);
    // Map back to original-bitmap coordinates
    const srcScaleX = origW / tw;
    const srcScaleY = origH / th;
    const scaledW = tw * scale;
    const scaledH = th * scale;
    const cropX = (scaledW - cW) / 2;
    const cropY = (scaledH - cH) / 2;
    const sx = Math.round((cropX / scale) * srcScaleX);
    const sy = Math.round((cropY / scale) * srcScaleY);
    const sw = Math.round((cW / scale) * srcScaleX);
    const sh = Math.round((cH / scale) * srcScaleY);
    return {
      canvasW: cW,
      canvasH: cH,
      sx,
      sy,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: cW,
      dh: cH,
    };
  }

  // No exact dimensions — simple proportional resize to tw×th
  return {
    canvasW: tw,
    canvasH: th,
    sx: 0,
    sy: 0,
    sw: origW,
    sh: origH,
    dx: 0,
    dy: 0,
    dw: tw,
    dh: th,
  };
}

// ---------------------------------------------------------------------------
// EXIF helpers (Gap #9: retainExif)
// ---------------------------------------------------------------------------

/**
 * Extracts the raw APP1/Exif segment (FF E1 … bytes) from a JPEG buffer.
 * Returns `null` if not found or input is not JPEG.
 */
function extractExifSegment(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  if (len < 4 || view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < len) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const segLen = view.getUint16(offset + 2); // includes the 2-byte length field
    if (marker === 0xe1 && offset + 10 < len) {
      // APP1 — check for 'Exif\0\0' header at offset+4
      if (
        view.getUint8(offset + 4) === 0x45 && // E
        view.getUint8(offset + 5) === 0x78 && // x
        view.getUint8(offset + 6) === 0x69 && // i
        view.getUint8(offset + 7) === 0x66 // f
      ) {
        return new Uint8Array(buffer, offset, 2 + segLen);
      }
    }
    if (segLen < 2) break;
    offset += 2 + segLen;
  }
  return null;
}

/**
 * Injects an EXIF APP1 segment into a JPEG ArrayBuffer immediately after SOI.
 * Any existing APP1-Exif in the output is stripped first.
 */
function injectExifIntoJpeg(jpegBuffer: ArrayBuffer, exif: Uint8Array): ArrayBuffer {
  const src = new Uint8Array(jpegBuffer);
  // Skip past SOI (2 bytes) and any existing APP0/APP1 segments in output
  let outStart = 2;
  const view = new DataView(jpegBuffer);
  while (outStart + 3 < jpegBuffer.byteLength) {
    if (view.getUint8(outStart) !== 0xff) break;
    const marker = view.getUint8(outStart + 1);
    const segLen = view.getUint16(outStart + 2);
    if (marker === 0xe1) {
      // Strip existing APP1 (may be from canvas encoder)
      outStart += 2 + segLen;
    } else {
      break;
    }
  }
  // Build: SOI + injected EXIF + rest of output from outStart
  const result = new Uint8Array(2 + exif.length + (src.length - outStart));
  result[0] = 0xff;
  result[1] = 0xd8;
  result.set(exif, 2);
  result.set(src.subarray(outStart), 2 + exif.length);
  return result.buffer;
}

// ---------------------------------------------------------------------------
// Shared decode helper: get original pixel dimensions
// ---------------------------------------------------------------------------

async function getOriginalDimensions(
  blob: Blob,
  input: ArrayBuffer | Blob,
): Promise<{ width: number; height: number }> {
  // Try zero-decode header first (~1µs)
  const buf = input instanceof ArrayBuffer ? input : await blob.slice(0, 512).arrayBuffer();
  const dims = getImageDimensionsFromHeader(buf);
  if (dims) return dims;
  // Fallback: probe decode (pays the GPU decode cost, but only once)
  const tmp = await createImageBitmap(blob);
  const result = { width: tmp.width, height: tmp.height };
  tmp.close();
  return result;
}

// ---------------------------------------------------------------------------
// FAST PATH: Image Processing (worker variant — returns ArrayBuffer)
// ---------------------------------------------------------------------------

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
  const blob = input instanceof Blob ? input : new Blob([input]);

  // Resolve original dimensions when any resize/layout option is active
  const needsDims = !!(
    options.maxWidth ||
    options.maxHeight ||
    options.minWidth ||
    options.minHeight ||
    options.width ||
    options.height
  );

  let params: DrawParams | null = null;
  if (needsDims) {
    const { width: origW, height: origH } = await getOriginalDimensions(blob, input);
    params = computeDrawParams(origW, origH, options);
  }

  // Gap #8: checkOrientation — pass imageOrientation:'none' to suppress EXIF auto-rotate
  const bitmapOpts: ImageBitmapOptions = {};
  if (options.checkOrientation === false) bitmapOpts.imageOrientation = 'none';

  const bitmap = await createImageBitmap(blob, bitmapOpts);
  const origW = bitmap.width;
  const origH = bitmap.height;

  // If no resize constraints, derive simple params now that we have bitmap dims
  if (!params) params = computeDrawParams(origW, origH, options);

  const { canvasW, canvasH, sx, sy, sw, sh, dx, dy, dw, dh } = params;

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for OffscreenCanvas');

  // Gap #6: beforeDraw hook
  options.beforeDraw?.(canvas, ctx as OffscreenCanvasRenderingContext2D);

  ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
  bitmap.close();

  // Gap #7: drew hook
  options.drew?.(canvas, ctx as OffscreenCanvasRenderingContext2D);

  const mimeType = getMimeType(options.type, options.format);
  const outBlob = await canvas.convertToBlob({ type: mimeType, quality: options.quality ?? 0.8 });

  // Gap #9: retainExif — re-inject original EXIF into JPEG output
  if (options.retainExif && mimeType === 'image/jpeg') {
    const srcBuf = input instanceof ArrayBuffer ? input : await blob.arrayBuffer();
    const exif = extractExifSegment(srcBuf);
    if (exif) {
      const outBuf = await outBlob.arrayBuffer();
      return injectExifIntoJpeg(outBuf, exif);
    }
  }

  return outBlob.arrayBuffer();
}

// ---------------------------------------------------------------------------
// FAST PATH: Zero-copy main-thread variant (returns Blob)
// ---------------------------------------------------------------------------

/**
 * Zero-copy, main-thread-optimised variant.
 *
 * Key optimisations over the worker path:
 *  1. No Blob→ArrayBuffer→Blob round-trips (returns Blob directly).
 *  2. Uses HTMLCanvasElement + canvas.toBlob() when DOM is available (main thread).
 *     HTMLCanvas has a direct CPU-backed pixel store; OffscreenCanvas routes
 *     pixel readback through an async GPU IPC call — measurably slower, especially
 *     for JPEG (no hardware encoder in Chrome's OffscreenCanvas path).
 *  3. Opaque context (alpha:false) for JPEG — skips alpha channel blending.
 *  4. premultiplyAlpha:'none' avoids an extra per-pixel multiply pass.
 */
export async function processImageFastPathToBlob(
  input: ArrayBuffer | Blob,
  options: CompressorOptions,
): Promise<Blob> {
  const blob = input instanceof Blob ? input : new Blob([input]);

  const needsDims = !!(
    options.maxWidth ||
    options.maxHeight ||
    options.minWidth ||
    options.minHeight ||
    options.width ||
    options.height
  );

  let params: DrawParams | null = null;
  if (needsDims) {
    const { width: origW, height: origH } = await getOriginalDimensions(blob, input);
    params = computeDrawParams(origW, origH, options);
  }

  const mimeType = getMimeType(options.type, options.format);
  const quality = options.quality ?? 0.8;

  // Gap #8: checkOrientation
  const bitmapOpts: ImageBitmapOptions = { premultiplyAlpha: 'none' };
  if (options.checkOrientation === false) bitmapOpts.imageOrientation = 'none';

  const bitmap = await createImageBitmap(blob, bitmapOpts);
  const origW = bitmap.width;
  const origH = bitmap.height;

  if (!params) params = computeDrawParams(origW, origH, options);

  const { canvasW, canvasH, sx, sy, sw, sh, dx, dy, dw, dh } = params;

  // Main thread has DOM access → HTMLCanvasElement is faster (CPU-backed pixel store)
  const hasDom = typeof document !== 'undefined';

  let outBlob: Blob;

  if (hasDom) {
    const isJpeg = mimeType === 'image/jpeg';
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d', { alpha: !isJpeg })!;

    // Gap #6: beforeDraw hook
    options.beforeDraw?.(canvas, ctx);

    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    bitmap.close();

    // Gap #7: drew hook
    options.drew?.(canvas, ctx);

    outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        mimeType,
        quality,
      );
    });
  } else {
    // Worker fallback: OffscreenCanvas
    const canvas = new OffscreenCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for OffscreenCanvas');

    // Gap #6: beforeDraw hook
    options.beforeDraw?.(canvas, ctx as OffscreenCanvasRenderingContext2D);

    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    bitmap.close();

    // Gap #7: drew hook
    options.drew?.(canvas, ctx as OffscreenCanvasRenderingContext2D);

    outBlob = await canvas.convertToBlob({ type: mimeType, quality });
  }

  // Gap #9: retainExif — re-inject original EXIF into JPEG output
  if (options.retainExif && mimeType === 'image/jpeg') {
    const srcBuf = input instanceof ArrayBuffer ? input : await blob.arrayBuffer();
    const exif = extractExifSegment(srcBuf);
    if (exif) {
      const outBuf = await outBlob.arrayBuffer();
      const injected = injectExifIntoJpeg(outBuf, exif);
      return new Blob([injected], { type: mimeType });
    }
  }

  return outBlob;
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
