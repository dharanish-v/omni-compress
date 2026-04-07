# Omni Compress

<p align="center">
  <img src="https://img.shields.io/npm/v/omni-compress?style=flat-square&color=0f4c81" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/dharanish-v/omni-compress?style=flat-square&color=5386b4" alt="License" />
  <img src="https://img.shields.io/npm/dt/omni-compress?style=flat-square&color=c06c5b" alt="NPM Downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/dharanish-v/omni-compress/ci.yml?branch=master&style=flat-square&color=d9a05b" alt="CI Status" />
  <img src="https://img.shields.io/endpoint?url=https://dharanish-v.github.io/omni-compress/coverage.json&style=flat-square" alt="Coverage" />
  <img src="https://img.shields.io/badge/Tested_with-Vitest-729B1B?style=flat-square&logo=vitest" alt="Tested with Vitest" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square" alt="TypeScript" />
</p>

<p align="center">
  <b>Universal compression and archiving for browsers and Node.js.</b><br/>
  One API. Three engines. Isomorphic ZIP & Media processing.
</p>

<p align="center">
  <a href="https://dharanish-v.github.io/omni-compress/"><b>Live Neo-Brutalist Demo 🚀</b></a>
</p>

---

`omni-compress` is a high-performance, isomorphic compression library. It automatically routes media compression (images/audio/video) to the fastest available engine at runtime — native Web APIs, FFmpeg WebAssembly, or OS-level binaries — and provides built-in ZIP archiving for any file type.

| Problem                                        | How omni-compress solves it                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Browser and Node need different code paths     | Single Isomorphic API — environment detection is automatic                        |
| Archiving or batching needs separate libs      | **Built-in ZIP** `archive()` and `archiveStream()` for any file type             |
| FFmpeg Wasm is heavy (~30 MB) and slow to load | Uses native `OffscreenCanvas`/`WebCodecs` for standard formats (0 KB Wasm)       |
| Media processing freezes the UI                | **ALL** browser work runs in Web Workers with zero-copy `Transferable` transfers |
| FFmpeg Wasm is too slow                        | **Multi-threading** support via `@ffmpeg/core-mt` (requires COOP/COEP)           |
| Wasm memory leaks crash browser tabs           | FFmpeg singleton with idle-timeout auto-termination; VFS cleanup per-operation   |
| Large files crash the browser silently         | `FileTooLargeError` thrown before loading files > 250 MB into Wasm               |
| Fast Path fails on unsupported browsers        | Automatic fallback from Fast Path to Heavy Path on any runtime error             |
| No way to cancel a running compression         | Full `AbortSignal` support — terminates Wasm/child process on abort              |
| Silent failures when file extension ≠ content  | `detectFormat()` reads magic bytes to identify the real format                   |

## Install

```bash
npm install omni-compress
```

```bash
# bun
bun add omni-compress

# pnpm
pnpm add omni-compress

# yarn
yarn add omni-compress
```

> Previously published as `@dharanish/omni-compress` (deprecated — please migrate to `omni-compress`).

> **Node.js users:** For the Node adapter to work, install `ffmpeg-static` (bundled as an optional dependency) or ensure `ffmpeg` is available on your system `PATH`.

> **AVIF in the browser:** AVIF encoding uses `@jsquash/avif` (standalone libaom-av1 Wasm from Google's Squoosh, 1.1 MB gzipped). It is bundled automatically -- no extra install or configuration needed. No SharedArrayBuffer or special headers required.

## Quick Start

```typescript
import { compressImage, compressAudio, compressVideo } from "omni-compress";

// Image → WebP
const { blob, ratio } = await compressImage(imageFile, {
  format: "webp",
  quality: 0.8,
});
console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);

// Audio → Opus (with cancellation)
const controller = new AbortController();
const { blob: audio } = await compressAudio(audioFile, {
  format: "opus",
  bitrate: "96k",
  onProgress: (p) => console.log(`${p}%`),
  signal: controller.signal,
});

// Video → MP4
const { blob: video } = await compressVideo(videoFile, {
  format: "mp4",
  bitrate: "1M",
});

// Archive multiple files into a ZIP
import { archive } from "omni-compress";
const { blob: zip } = await archive([
  { name: "photo.webp", data: blob },
  { name: "audio.opus", data: audio },
  { name: "video.mp4", data: video },
]);
```

## API Reference

### v2.0 Named Exports (recommended)

#### `compressImage(input, options): Promise<CompressResult>`

Compresses an image using the fastest available engine (OffscreenCanvas fast path, FFmpeg Wasm heavy path, or native ffmpeg on Node).

```typescript
import { compressImage } from "omni-compress";

const result = await compressImage(file, {
  format: "webp",
  quality: 0.8,
  maxWidth: 1920,
  signal: controller.signal,
});
// result.blob       → the compressed Blob
// result.ratio      → e.g. 0.62 (38% smaller)
// result.originalSize / result.compressedSize → bytes
```

**`ImageOptions`**

| Property           | Type                              | Default | Description                                              |
| ------------------ | --------------------------------- | ------- | -------------------------------------------------------- |
| `format`           | `'webp' \| 'avif' \| 'jpeg' \| 'png'` | —   | Target output format                                     |
| `quality`          | `number`                          | `0.8`   | Lossy quality `0.0` – `1.0`                              |
| `maxWidth`         | `number`                          | —       | Max output width in px (aspect ratio preserved)          |
| `maxHeight`        | `number`                          | —       | Max output height in px (aspect ratio preserved)         |
| `preserveMetadata` | `boolean`                         | `false` | Keep EXIF data in the output                             |
| `useWorker`        | `boolean`                         | Auto    | Force Web Worker (true) or Main Thread (false)           |
| `onProgress`       | `(percent: number) => void`       | —       | Progress callback `0` – `100`                            |
| `signal`           | `AbortSignal`                     | —       | Cancel the operation — throws `AbortError` when signalled |

#### `compressAudio(input, options): Promise<CompressResult>`

Compresses an audio file via WebCodecs (fast path) or FFmpeg Wasm (heavy path).

**`AudioOptions`**

| Property           | Type                              | Default  | Description                                              |
| ------------------ | --------------------------------- | -------- | -------------------------------------------------------- |
| `format`           | `'opus' \| 'mp3' \| 'flac' \| 'wav' \| 'aac'` | — | Target output format                          |
| `bitrate`          | `string`                          | `'128k'` | Target bitrate, e.g. `'96k'`, `'192k'`                  |
| `channels`         | `1 \| 2`                          | Auto     | Output channel count (1 = mono, 2 = stereo)              |
| `sampleRate`       | `number`                          | Auto     | Output sample rate in Hz, e.g. `48000`                   |
| `preserveMetadata` | `boolean`                         | `false`  | Keep audio tags in the output                            |
| `useWorker`        | `boolean`                         | Auto     | Force Web Worker (true) or Main Thread (false)           |
| `onProgress`       | `(percent: number) => void`       | —        | Progress callback `0` – `100`                            |
| `signal`           | `AbortSignal`                     | —        | Cancel the operation — throws `AbortError` when signalled |

#### `compressVideo(input, options): Promise<CompressResult>`

Compresses a video file via WebCodecs (fast path foundation) or FFmpeg Wasm (heavy path).

**`VideoOptions`**

| Property           | Type                        | Default | Description                                              |
| ------------------ | --------------------------- | ------- | -------------------------------------------------------- |
| `format`           | `'mp4' \| 'webm'`           | —       | Target output format                                     |
| `bitrate`          | `string`                    | `'1M'`  | Target video bitrate, e.g. `'500k'`, `'2M'`              |
| `fps`              | `number`                    | Auto    | Output frame rate                                        |
| `maxWidth`         | `number`                    | —       | Max output width in px                                   |
| `maxHeight`        | `number`                    | —       | Max output height in px                                  |
| `preserveMetadata` | `boolean`                   | `false` | Keep metadata in the output                              |
| `useWorker`        | `boolean`                   | Auto    | Force Web Worker (true) or Main Thread (false)           |
| `onProgress`       | `(percent: number) => void` | —       | Progress callback `0` – `100`                            |
| `signal`           | `AbortSignal`               | —       | Cancel the operation — throws `AbortError` when signalled |

#### `CompressResult`

`compressImage`, `compressAudio`, and `compressVideo` return a `CompressResult`:

```typescript
interface CompressResult {
  blob: Blob;           // The compressed output
  originalSize: number; // Input size in bytes
  compressedSize: number; // Output size in bytes
  ratio: number;        // compressedSize / originalSize (< 1.0 = smaller)
  format: string;       // Target format used (e.g. 'webp')
}
```

#### `archive(entries, options?): Promise<ArchiveResult>`

Compresses an array of files into a ZIP archive. Works identically in browser and Node.js.

```typescript
import { archive } from "omni-compress";

const result = await archive(
  [
    { name: "images/photo.webp", data: imageBlob },
    { name: "audio/track.opus", data: audioBlob },
  ],
  { level: 6, signal: controller.signal }
);
// result.blob       → the ZIP Blob (application/zip)
// result.ratio      → compression ratio
```

#### `archiveStream(entries, options?): ReadableStream<Uint8Array>`

Streaming ZIP output — prefer this for large archives where you want to start sending bytes before all entries are compressed.

```typescript
import { archiveStream } from "omni-compress";

const stream = archiveStream(entries, { level: 6 });
const response = new Response(stream, {
  headers: { "Content-Type": "application/zip" },
});
```

**`ArchiveOptions`**

| Property     | Type                        | Default | Description                                    |
| ------------ | --------------------------- | ------- | ---------------------------------------------- |
| `format`     | `'zip'`                     | `'zip'` | Archive format (only ZIP supported currently)  |
| `level`      | `0` – `9`                   | `6`     | fflate deflate level (0 = store, 9 = max compression) |
| `onProgress` | `(percent: number) => void` | —       | Progress callback `0` – `100`                  |
| `signal`     | `AbortSignal`               | —       | Cancel — throws `AbortError`                   |

#### `detectFormat(buffer): string | null`

Reads the first 16 bytes of a buffer and returns the file's actual format from its magic bytes — not its extension.

```typescript
import { detectFormat } from "omni-compress";

const buffer = await file.arrayBuffer();
const format = detectFormat(buffer);
// e.g. 'webp', 'jpeg', 'flac', 'ogg', null (unknown)
```

Supported signatures: `jpeg`, `png`, `gif`, `webp`, `wav`, `avif`, `flac`, `ogg`, `mp3`, `aac`.

---

### v1.x Legacy API (deprecated)

> **`OmniCompressor.process()` is deprecated** as of v2.0. It will continue to work until v3.0 but returns a raw `Blob` instead of the richer `CompressResult`. Migrate to `compressImage()` or `compressAudio()`.

```typescript
import { OmniCompressor } from "omni-compress";

/** @deprecated Use compressImage() or compressAudio() instead */
const blob = await OmniCompressor.process(file, {
  type: "image",
  format: "webp",
  quality: 0.8,
});
```

---

## Cancellation (AbortSignal)

Pass an `AbortSignal` to any compression or archive call to cancel it mid-flight:

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const result = await compressImage(file, {
    format: "avif",
    signal: controller.signal,
  });
} catch (err) {
  if (err instanceof AbortError) {
    console.log("Compression was cancelled");
  }
}
```

When a browser compression is cancelled, the underlying Web Worker is **terminated** (killing FFmpeg Wasm mid-run) and a fresh worker is created for the next call. On Node.js, the `ffmpeg` child process receives `SIGTERM`.

---

## Error Classes

All library errors extend `OmniCompressError` and carry a machine-readable `code` field:

```typescript
import {
  OmniCompressError,
  FileTooLargeError,
  FormatNotSupportedError,
  InvalidOptionsError,
  AbortError,
  EncoderError,
} from "omni-compress";

try {
  await compressImage(file, { format: "webp" });
} catch (err) {
  if (err instanceof FileTooLargeError) {
    console.log(err.fileSize, err.maxSize); // bytes
  } else if (err instanceof AbortError) {
    console.log("Cancelled"); // err.code === 'ABORTED'
  } else if (err instanceof FormatNotSupportedError) {
    console.log(err.format); // e.g. 'hevc'
  }
}
```

| Error Class              | Code                  | When Thrown                                                       |
| ------------------------ | --------------------- | ----------------------------------------------------------------- |
| `OmniCompressError`      | —                     | Base class for all library errors                                 |
| `FileTooLargeError`      | `FILE_TOO_LARGE`      | Input exceeds 250 MB (browser) — prevents Wasm OOM               |
| `FormatNotSupportedError`| `FORMAT_NOT_SUPPORTED`| Requested format is not valid for the given media type            |
| `InvalidOptionsError`    | `INVALID_OPTIONS`     | Options object is missing required fields or contains invalid values |
| `AbortError`             | `ABORTED`             | `AbortSignal` fired before or during processing                   |
| `EncoderError`           | `ENCODER_FAILED`      | FFmpeg or fflate encoder threw — wraps the underlying cause       |

---

## Supported Formats

### Images

| Format | Fast Path (OffscreenCanvas) | Heavy Path (FFmpeg Wasm) | Node (OS binary) |
| ------ | --------------------------- | ------------------------ | ---------------- |
| WebP   | ✅                          | ✅ libwebp               | ✅ ffmpeg        |
| AVIF   | ❌ (not supported by OffscreenCanvas) | ✅ @jsquash/avif (libaom-av1) | ✅ ffmpeg        |
| JPEG   | ✅                          | ✅                       | ✅ ffmpeg        |
| PNG    | ✅                          | ✅                       | ✅ ffmpeg        |
| HEIC   | —                           | ✅                       | ✅ ffmpeg        |
| TIFF   | —                           | ✅                       | ✅ ffmpeg        |

### Audio

| Format   | Fast Path (WebCodecs) | Heavy Path (FFmpeg Wasm) | Node (OS binary) |
| -------- | --------------------- | ------------------------ | ---------------- |
| MP3      | —                     | ✅ libmp3lame            | ✅ ffmpeg        |
| Opus/OGG | ✅ (Opus)             | ✅ libopus               | ✅ ffmpeg        |
| FLAC     | —                     | ✅ flac                  | ✅ ffmpeg        |
| WAV      | —                     | ✅                       | ✅ ffmpeg        |
| AAC      | ✅                    | ✅                       | ✅ ffmpeg        |

### Video

| Format | Heavy Path (FFmpeg Wasm) | Node (OS binary) |
| ------ | ------------------------ | ---------------- |
| MP4    | ✅ libx264               | ✅ ffmpeg        |
| WebM   | ✅ libvpx-vp9            | ✅ ffmpeg        |

---

## Architecture

```
compressImage() / compressAudio() / compressVideo()
        │
        ▼
   ┌─────────┐
   │  Router │  ← Evaluates runtime + format + size
   └────┬────┘
        │
   ┌────┴────────────────────────────┐
   │                │                │
   ▼                ▼                ▼
 Fast Path      Heavy Path       Node Adapter
 (Native)     (FFmpeg Wasm)    (child_process)
   │                │                │
OffscreenCanvas    @ffmpeg/ffmpeg    OS ffmpeg binary
WebCodecs (A/V)    Multi-threaded    Via ffmpeg-static
   │                │                │
   └────────────────┴────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
  Main Thread Path        Web Worker Path
  (High Speed)            (Isolation)
  Files < 4MB             Files > 4MB
  Zero-latency            Non-blocking
```

### Intelligent Routing

`omni-compress` includes a smart switching engine that dynamically chooses between the **Main Thread** and **Web Workers**:

*   **Main Thread Path:** Standard web files (< 4MB) using native Fast Paths run directly on the main thread. This eliminates `postMessage` communication latency (~50-150ms), matching the performance of legacy main-thread-only libraries like `compressorjs`.
    *   *Note: AVIF uses a lower 512KB threshold due to higher CPU intensity.*
*   **Web Worker Path:** Large files and all FFmpeg Heavy Path tasks are automatically dispatched to background workers. This ensures that long-running operations never freeze your application's UI.


---

## Playground & Themes

The [Live Demo](https://dharanish-v.github.io/omni-compress/) features a **Neo-Brutalist "Laboratory" UI** with 25 distinct persona-based themes (Shakespeare, Picasso, Aryabhata, etc.) supporting multiple languages with culturally relevant quotes and accurate technical terminology.

---

## Contributing

We welcome contributions! Please see the [Contributing Guide](https://github.com/dharanish-v/omni-compress/blob/master/CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) &copy; Dharanish V
