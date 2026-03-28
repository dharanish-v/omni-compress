# Omni Compress

<p align="center">
  <img src="https://img.shields.io/npm/v/@dharanish/omni-compress?style=flat-square&color=0f4c81" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/dharanish-v/omni-compress?style=flat-square&color=5386b4" alt="License" />
  <img src="https://img.shields.io/npm/dt/@dharanish/omni-compress?style=flat-square&color=c06c5b" alt="NPM Downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/dharanish-v/omni-compress/ci.yml?branch=master&style=flat-square&color=d9a05b" alt="CI Status" />
  <img src="https://img.shields.io/endpoint?url=https://dharanish-v.github.io/omni-compress/coverage.json&style=flat-square" alt="Coverage" />
  <img src="https://img.shields.io/badge/Tested_with-Vitest-729B1B?style=flat-square&logo=vitest" alt="Tested with Vitest" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square" alt="TypeScript" />
</p>

<p align="center">
  <b>Smart-routing media compression for browsers and Node.js.</b><br/>
  One API. Three engines. Zero main-thread blocking.
</p>

<p align="center">
  <a href="https://dharanish-v.github.io/omni-compress/"><b>Live Neo-Brutalist Demo 🚀</b></a>
</p>

---

`omni-compress` accepts an image or audio file and automatically routes the compression to the fastest available engine at runtime — native Web APIs, FFmpeg WebAssembly, or OS-level ffmpeg binaries — without you writing a single line of platform-specific code.

## Why omni-compress?

| Problem                                        | How omni-compress solves it                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| FFmpeg Wasm is heavy (~30 MB) and slow to load | Uses native `OffscreenCanvas` for standard formats (0 KB Wasm)                   |
| Media processing freezes the UI                | **ALL** browser work runs in Web Workers with zero-copy `Transferable` transfers |
| Browser and Node need different code paths     | Single API — environment detection is automatic                                  |
| Wasm memory leaks crash browser tabs           | FFmpeg singleton with idle-timeout auto-termination; VFS cleanup per-operation   |
| Large files crash the browser silently         | `FileTooLargeError` thrown before loading files > 250 MB into Wasm               |
| Fast Path fails on unsupported browsers        | Automatic fallback from Fast Path to Heavy Path on any runtime error             |
| Dynamic imports break some bundlers            | Tree-shakeable ESM + CJS dual build, no side effects, lazy Wasm loading          |
| No way to cancel a running compression         | Full `AbortSignal` support — terminates Wasm/child process on abort              |
| Silent failures when file extension ≠ content  | `detectFormat()` reads magic bytes to identify the real format                   |
| Archiving needs a separate library             | Built-in `archive()` / `archiveStream()` using fflate (isomorphic ZIP, 11 KB)   |

## Install

```bash
npm install @dharanish/omni-compress
```

```bash
# bun
bun add @dharanish/omni-compress

# pnpm
pnpm add @dharanish/omni-compress

# yarn
yarn add @dharanish/omni-compress
```

> **Node.js users:** For the Node adapter to work, install `ffmpeg-static` (bundled as an optional dependency) or ensure `ffmpeg` is available on your system `PATH`.

> **AVIF in the browser:** AVIF encoding uses `@jsquash/avif` (standalone libaom-av1 Wasm from Google's Squoosh, 1.1 MB gzipped). It is bundled automatically -- no extra install or configuration needed. No SharedArrayBuffer or special headers required.

## Quick Start

```typescript
import { compressImage, compressAudio } from "@dharanish/omni-compress";

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

// Archive multiple files into a ZIP
import { archive } from "@dharanish/omni-compress";
const { blob: zip } = await archive([
  { name: "photo.webp", data: blob },
  { name: "audio.opus", data: audio },
]);
```

## API Reference

### v2.0 Named Exports (recommended)

#### `compressImage(input, options): Promise<CompressResult>`

Compresses an image using the fastest available engine (OffscreenCanvas fast path, FFmpeg Wasm heavy path, or native ffmpeg on Node).

```typescript
import { compressImage } from "@dharanish/omni-compress";

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
| `onProgress`       | `(percent: number) => void`       | —       | Progress callback `0` – `100` (FFmpeg path only)         |
| `signal`           | `AbortSignal`                     | —       | Cancel the operation — throws `AbortError` when signalled |

#### `compressAudio(input, options): Promise<CompressResult>`

Compresses an audio file via FFmpeg Wasm (browser) or native ffmpeg (Node).

**`AudioOptions`**

| Property           | Type                              | Default  | Description                                              |
| ------------------ | --------------------------------- | -------- | -------------------------------------------------------- |
| `format`           | `'opus' \| 'mp3' \| 'flac' \| 'wav' \| 'aac'` | — | Target output format                          |
| `bitrate`          | `string`                          | `'128k'` | Target bitrate, e.g. `'96k'`, `'192k'`                  |
| `channels`         | `1 \| 2`                          | Auto     | Output channel count (1 = mono, 2 = stereo)              |
| `sampleRate`       | `number`                          | Auto     | Output sample rate in Hz, e.g. `48000`                   |
| `preserveMetadata` | `boolean`                         | `false`  | Keep audio tags in the output                            |
| `onProgress`       | `(percent: number) => void`       | —        | Progress callback `0` – `100`                            |
| `signal`           | `AbortSignal`                     | —        | Cancel the operation — throws `AbortError` when signalled |

#### `CompressResult`

Both `compressImage` and `compressAudio` return a `CompressResult`:

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
import { archive } from "@dharanish/omni-compress";

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
import { archiveStream } from "@dharanish/omni-compress";

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
import { detectFormat } from "@dharanish/omni-compress";

const buffer = await file.arrayBuffer();
const format = detectFormat(buffer);
// e.g. 'webp', 'jpeg', 'flac', 'ogg', null (unknown)
```

Supported signatures: `jpeg`, `png`, `gif`, `webp`, `wav`, `avif`, `flac`, `ogg`, `mp3`, `aac`.

---

### v1.x Legacy API (deprecated)

> **`OmniCompressor.process()` is deprecated** as of v2.0. It will continue to work until v3.0 but returns a raw `Blob` instead of the richer `CompressResult`. Migrate to `compressImage()` or `compressAudio()`.

```typescript
import { OmniCompressor } from "@dharanish/omni-compress";

/** @deprecated Use compressImage() or compressAudio() instead */
const blob = await OmniCompressor.process(file, {
  type: "image",
  format: "webp",
  quality: 0.8,
});
```

### `OmniCompressor.setLogLevel(level)`

Set the minimum log level. Accepts `'debug'`, `'info'`, `'warn'`, or `'error'`.

```typescript
OmniCompressor.setLogLevel("debug"); // Verbose logging for development
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
} from "@dharanish/omni-compress";

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

### Size Limits

| Environment    | Max Input Size | Reason                                                          |
| -------------- | -------------- | --------------------------------------------------------------- |
| Browser (Wasm) | 250 MB         | WebAssembly linear memory limit (~2–4 GB shared with encoding)  |
| Node.js        | Unlimited      | Native ffmpeg manages its own memory                            |

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

> **Note on AVIF:** OffscreenCanvas cannot encode AVIF in any browser. AVIF output in the browser routes through `@jsquash/avif` (standalone libaom-av1 Wasm from Google's Squoosh, 1.1 MB gzipped), not FFmpeg. No SharedArrayBuffer or special setup needed. On Node.js, AVIF uses the native ffmpeg binary.

### Audio

| Format   | Heavy Path (FFmpeg Wasm) | Node (OS binary) |
| -------- | ------------------------ | ---------------- |
| MP3      | ✅ libmp3lame            | ✅ ffmpeg        |
| Opus/OGG | ✅ libopus               | ✅ ffmpeg        |
| FLAC     | ✅ flac                  | ✅ ffmpeg        |
| WAV      | ✅                       | ✅ ffmpeg        |
| AAC      | ✅                       | ✅ ffmpeg        |

---

## Architecture

```
compressImage() / compressAudio()
        │
        ▼
   ┌─────────┐
   │  Router │  ← Evaluates runtime + format
   └────┬────┘
        │
   ┌────┴────────────────────────────┐
   │                │                │
   ▼                ▼                ▼
 Fast Path      Heavy Path       Node Adapter
 (Native)     (FFmpeg Wasm)    (child_process)
   │                │                │
OffscreenCanvas    @ffmpeg/ffmpeg    OS ffmpeg binary
(JPEG/PNG/WebP)    Lazy-loaded       Via ffmpeg-static
   │                │                │
   └────────────────┴────────────────┘
                    │
              Web Workers          ← Zero main-thread blocking
              Transferable Objects ← Zero-copy memory
              AbortSignal          ← Cancellation at any stage
```

### Processing Paths

1. **Fast Path** — JPEG, PNG, WebP in browsers. Uses `OffscreenCanvas` for hardware-accelerated encoding inside a Web Worker. **Zero Wasm overhead.** Falls back to Heavy Path automatically on any runtime error.

2. **Heavy Path** — All other formats (AVIF, HEIC, TIFF, FLAC, Opus, MP3 …) in browsers. Lazy-loads `@ffmpeg/ffmpeg` WebAssembly inside a Web Worker. The FFmpeg instance is a singleton reused across compressions (only the VFS is cleaned between calls) and self-terminates after 30 s of idle.

3. **Node Adapter** — Any format on Node.js or Electron. Spawns a native `child_process` using `ffmpeg-static` or a system-wide `ffmpeg` binary. Maximum performance, no Wasm.

---

## Framework Integration

### React

```tsx
import { compressImage, AbortError } from "@dharanish/omni-compress";

function ImageUploader() {
  const controllerRef = useRef<AbortController | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    controllerRef.current = new AbortController();

    const { blob, ratio } = await compressImage(file, {
      format: "webp",
      quality: 0.75,
      signal: controllerRef.current.signal,
    });

    const url = URL.createObjectURL(blob);
    console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
  };

  return (
    <>
      <input type="file" accept="image/*" onChange={handleFile} />
      <button onClick={() => controllerRef.current?.abort()}>Cancel</button>
    </>
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { compressAudio } from "@dharanish/omni-compress";

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const { blob, ratio } = await compressAudio(file, {
    format: "opus",
    bitrate: "96k",
  });
  console.log(`${Math.round((1 - ratio) * 100)}% smaller`);
}
</script>
```

### Node.js / Express

```typescript
import { compressImage } from "@dharanish/omni-compress";
import { readFile } from "fs/promises";

const buffer = await readFile("photo.png");
const blob = new Blob([buffer], { type: "image/png" });

const { blob: webp, ratio } = await compressImage(blob, {
  format: "webp",
  quality: 0.8,
});
```

---

## Bundler Configuration

### Vite

If you use Vite, you must exclude `@jsquash/avif` (along with FFmpeg) from Vite's dependency pre-bundling, otherwise the AVIF WebAssembly module will fail to load with a `magic word` error:

```javascript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@jsquash/avif']
  }
});
```

Web Workers require `Cross-Origin-Isolation` headers. Add [`coi-serviceworker`](https://github.com/nicolo-ribaudo/coi-serviceworker) to your `public/` directory, or configure your server:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Webpack 5

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [{ test: /\.worker\.js$/, type: "asset/resource" }],
  },
};
```

---

## Troubleshooting

| Issue                              | Solution                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SharedArrayBuffer is not defined` | Enable cross-origin isolation headers (see Bundler Configuration above)                               |
| `FFmpeg Wasm failed to load`       | Ensure CORS headers are set and your CSP allows `wasm-unsafe-eval`                                    |
| `ffmpeg: command not found` (Node) | Install `ffmpeg-static` or add `ffmpeg` to your system `PATH`                                         |
| Worker files 404                   | Verify `dist/workers/*.js` are served by your dev server or CDN                                       |
| Memory issues with large files     | The library uses 2-pass encoding for Opus to avoid Wasm OOM. For very large files, consider Node.js   |
| `FileTooLargeError` thrown         | File exceeds 250 MB. Reduce the size before compression, or use Node.js (no Wasm memory limit)        |
| AVIF output is wrong / tiny        | Ensure you're on v2.0+. Earlier versions silently routed AVIF to OffscreenCanvas (which can't encode it). AVIF now uses @jsquash/avif automatically. |
| Cancelled compression hangs        | Call `controller.abort()` — `AbortError` is thrown and the worker/process is terminated immediately   |

---

## Browser Compatibility

| Feature                     | Chrome        | Firefox       | Safari        | Edge          |
| --------------------------- | ------------- | ------------- | ------------- | ------------- |
| Fast Path (OffscreenCanvas) | 69+           | 105+          | 16.4+         | 79+           |
| Heavy Path (FFmpeg Wasm)    | 57+           | 52+           | 16.4+         | 79+           |
| Web Workers                 | ✅ All modern | ✅ All modern | ✅ All modern | ✅ All modern |
| AbortSignal                 | ✅ All modern | ✅ All modern | ✅ All modern | ✅ All modern |
| WebCodecs (Audio Fast Path) | 94+           | ❌            | ❌            | 94+           |

---

## Contributing

We welcome contributions! Please see the [Contributing Guide](https://github.com/dharanish-v/omni-compress/blob/master/CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) &copy; Dharanish V
