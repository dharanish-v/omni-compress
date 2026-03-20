# Omni Compress

<p align="center">
  <img src="https://img.shields.io/npm/v/@dharanish/omni-compress?style=flat-square&color=0f4c81" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/dharanish-v/omni-compress?style=flat-square&color=5386b4" alt="License" />
  <img src="https://img.shields.io/npm/dt/@dharanish/omni-compress?style=flat-square&color=c06c5b" alt="NPM Downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/dharanish-v/omni-compress/ci.yml?branch=master&style=flat-square&color=d9a05b" alt="CI Status" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square" alt="TypeScript" />
</p>

<p align="center">
  <b>Smart-routing media compression for browsers and Node.js.</b><br/>
  One API. Three engines. Zero main-thread blocking.
</p>

---

`omni-compress` accepts an image or audio file and automatically routes the compression to the fastest available engine at runtime — native Web APIs, FFmpeg WebAssembly, or OS-level ffmpeg binaries — without you writing a single line of platform-specific code.

## Why omni-compress?

| Problem | How omni-compress solves it |
|---|---|
| FFmpeg Wasm is heavy (~30 MB) and slow to load | Uses native `OffscreenCanvas` / `WebCodecs` for standard formats (0 KB Wasm) |
| Media processing freezes the UI | **ALL** browser work runs in Web Workers with zero-copy `Transferable` transfers |
| Browser and Node need different code paths | Single API — environment detection is automatic |
| Wasm memory leaks crash browser tabs | Explicit WASM FS cleanup and `ffmpeg.terminate()` after every execution |
| Dynamic imports break some bundlers | Tree-shakeable ESM + CJS dual build, no side effects, lazy Wasm loading |

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

## Quick Start

```typescript
import { OmniCompressor } from '@dharanish/omni-compress';

// Image compression
const webp = await OmniCompressor.process(imageFile, {
  type: 'image',
  format: 'webp',
  quality: 0.8,
});

// Audio compression
const mp3 = await OmniCompressor.process(audioFile, {
  type: 'audio',
  format: 'mp3',
  onProgress: (percent) => console.log(`${percent}%`),
});
```

## API Reference

### `OmniCompressor.process(file, options)`

Compresses a media file using the optimal engine for the current environment.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `file` | `File \| Blob` | The input media file |
| `options` | `CompressorOptions` | Configuration object (see below) |

**Returns:** `Promise<Blob>` — the compressed output.

### `CompressorOptions`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | `'image' \| 'audio'` | Yes | — | Media type |
| `format` | `string` | Yes | — | Target output format |
| `quality` | `number` | No | `0.8` | Lossy quality, `0.0` – `1.0` |
| `maxSizeMB` | `number` | No | — | Maximum output size in megabytes |
| `onProgress` | `(percent: number) => void` | No | — | Progress callback (`0` – `100`) |
| `originalFileName` | `string` | No | Auto-detected | Helps FFmpeg probe the input format |

### `OmniCompressor.setLogLevel(level)`

Set the minimum log level. Accepts `'debug'`, `'info'`, `'warn'`, or `'error'`.

```typescript
OmniCompressor.setLogLevel('debug'); // Verbose logging for development
```

## Supported Formats

### Images

| Format | Fast Path (native) | Heavy Path (Wasm) | Node (OS binary) |
|---|---|---|---|
| WebP | ✅ OffscreenCanvas | ✅ libwebp | ✅ ffmpeg |
| AVIF | ✅ OffscreenCanvas | ✅ libaom-av1 | ✅ ffmpeg |
| JPEG | ✅ OffscreenCanvas | ✅ FFmpeg | ✅ ffmpeg |
| PNG | ✅ OffscreenCanvas | ✅ FFmpeg | ✅ ffmpeg |
| HEIC | — | ✅ FFmpeg | ✅ ffmpeg |
| TIFF | — | ✅ FFmpeg | ✅ ffmpeg |

### Audio

| Format | Heavy Path (Wasm) | Node (OS binary) |
|---|---|---|
| MP3 | ✅ libmp3lame | ✅ ffmpeg |
| Opus/OGG | ✅ libopus | ✅ ffmpeg |
| FLAC | ✅ flac | ✅ ffmpeg |
| WAV | ✅ FFmpeg | ✅ ffmpeg |
| AAC | ✅ FFmpeg | ✅ ffmpeg |

## Architecture

```
OmniCompressor.process(file, options)
        │
        ▼
   ┌─────────┐
   │  Router  │  ← Evaluates runtime + format
   └────┬────┘
        │
   ┌────┴──────────────────────┐
   │          │                │
   ▼          ▼                ▼
 Fast Path  Heavy Path    Node Adapter
 (Native)   (FFmpeg Wasm)  (child_process)
   │          │                │
   │  OffscreenCanvas    @ffmpeg/ffmpeg    OS ffmpeg binary
   │  WebCodecs API      Lazy-loaded       Via ffmpeg-static
   │          │                │
   └──────────┴────────────────┘
              │
        Web Workers          ← Zero main-thread blocking
        Transferable Objects ← Zero-copy memory
```

### Processing Paths

1. **Fast Path** — Standard web formats (WebP, AVIF, JPEG, PNG) in browsers. Uses `OffscreenCanvas` for hardware-accelerated encoding inside a Web Worker. **Zero Wasm overhead.**

2. **Heavy Path** — Complex or obscure formats (HEIC, TIFF, FLAC, Opus) in browsers. Dynamically lazy-loads `@ffmpeg/ffmpeg` WebAssembly inside a Web Worker. Memory is explicitly cleaned up after every run.

3. **Node Adapter** — Any format on Node.js or Electron. Spawns a native `child_process` using `ffmpeg-static` or a system-wide `ffmpeg` binary. Maximum performance, no Wasm.

## Framework Integration

### React

```tsx
import { OmniCompressor } from '@dharanish/omni-compress';

function ImageUploader() {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const compressed = await OmniCompressor.process(file, {
      type: 'image',
      format: 'webp',
      quality: 0.75,
    });

    const url = URL.createObjectURL(compressed);
    // Use the URL for preview or upload
  };

  return <input type="file" accept="image/*" onChange={handleFile} />;
}
```

### Vue 3

```vue
<script setup lang="ts">
import { OmniCompressor } from '@dharanish/omni-compress';

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const compressed = await OmniCompressor.process(file, {
    type: 'audio',
    format: 'mp3',
    quality: 0.8,
  });
  // Upload or play the compressed blob
}
</script>
```

### Node.js / Express

```typescript
import { OmniCompressor } from '@dharanish/omni-compress';
import { readFile } from 'fs/promises';

const buffer = await readFile('photo.png');
const blob = new Blob([buffer], { type: 'image/png' });

const webp = await OmniCompressor.process(blob, {
  type: 'image',
  format: 'webp',
  quality: 0.8,
});
```

## Bundler Configuration

### Vite

Web Workers require `Cross-Origin-Isolation` headers. Add [`coi-serviceworker`](https://github.com/nicolo-ribaudo/coi-serviceworker) to your `public/` directory, or configure your server to send the required headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Webpack 5

Ensure the worker files are served correctly:

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        type: 'asset/resource',
      },
    ],
  },
};
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `SharedArrayBuffer is not defined` | Enable cross-origin isolation headers (see Bundler Configuration above) |
| `FFmpeg Wasm failed to load` | Ensure CORS headers are set and your CSP allows `wasm-unsafe-eval` |
| `ffmpeg: command not found` (Node) | Install `ffmpeg-static` or add `ffmpeg` to your system `PATH` |
| Worker files 404 | Verify `dist/workers/*.js` are served by your dev server or CDN |
| Memory issues with large files | The library uses 2-pass encoding for Opus to avoid Wasm OOM; for very large files, consider chunking on the application side |

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| Fast Path (OffscreenCanvas) | 69+ | 105+ | 16.4+ | 79+ |
| Heavy Path (FFmpeg Wasm) | 57+ | 52+ | 16.4+ | 79+ |
| Web Workers | ✅ All modern | ✅ All modern | ✅ All modern | ✅ All modern |
| WebCodecs (Audio Fast Path) | 94+ | ❌ | ❌ | 94+ |

## Contributing

We welcome contributions! Please see the [Contributing Guide](https://github.com/dharanish-v/omni-compress/blob/master/CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) &copy; Dharanish V
