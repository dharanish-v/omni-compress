# Why omni-compress

## One install. Seven libraries replaced.

```bash
npm install omni-compress
```

replaces all of these:

| Library                     | Downloads/week | What you used it for              |
| --------------------------- | -------------- | --------------------------------- |
| `browser-image-compression` | 778K           | Browser image compression         |
| `compressorjs`              | 296K           | Browser image compression         |
| `jimp`                      | 2.25M          | Node.js image resize + compress   |
| `lamejs`                    | 61K            | Browser MP3 encoding              |
| `heic2any`                  | 544K           | HEIC/HEIF → JPEG/PNG conversion   |
| `@ffmpeg/ffmpeg`            | 377K           | Raw FFmpeg Wasm wrapper           |
| `pica`                      | 111K           | High-quality browser image resize |

**Total addressable downloads: ~4.4M/week.**

---

## Feature matrix

| Feature                  | omni-compress | browser-image-compression | compressorjs |  sharp   |  jimp   |  lamejs  | heic2any | @ffmpeg/ffmpeg |
| ------------------------ | :-----------: | :-----------------------: | :----------: | :------: | :-----: | :------: | :------: | :------------: |
| **Browser**              |      ✅       |            ✅             |      ✅      |    ❌    | ⚠️ slow |    ✅    |    ✅    |       ✅       |
| **Node.js**              |      ✅       |            ❌             |      ❌      |    ✅    |   ✅    |    ❌    |    ❌    |       ❌       |
| **Web Workers**          |    ✅ auto    |         ✅ opt-in         |      ❌      |   N/A    |   ❌    |    ❌    |    ❌    |       ❌       |
| **Images**               |      ✅       |            ✅             |      ✅      |    ✅    |   ✅    |    ❌    |    ❌    |       ✅       |
| **Audio**                |      ✅       |            ❌             |      ❌      |    ❌    |   ❌    | MP3 only |    ❌    |       ✅       |
| **Video**                |      ✅       |            ❌             |      ❌      |    ❌    |   ❌    |    ❌    |    ❌    |       ✅       |
| **JPEG output**          |      ✅       |            ✅             |      ✅      |    ✅    |   ✅    |    ❌    |    ✅    |       ✅       |
| **WebP output**          |      ✅       |            ✅             |      ✅      |    ✅    |   ✅    |    ❌    |    ❌    |       ✅       |
| **AVIF output**          |      ✅       |            ❌             |      ❌      |    ✅    |   ❌    |    ❌    |    ❌    |       ✅       |
| **HEIC input**           |      ✅       |            ❌             |      ❌      |   ✅\*   |   ❌    |    ❌    |    ✅    |       ✅       |
| **MP3**                  |      ✅       |            ❌             |      ❌      |    ❌    |   ❌    |    ✅    |    ❌    |       ✅       |
| **Opus**                 |      ✅       |            ❌             |      ❌      |    ❌    |   ❌    |    ❌    |    ❌    |       ✅       |
| **FLAC**                 |      ✅       |            ❌             |      ❌      |    ❌    |   ❌    |    ❌    |    ❌    |       ✅       |
| **AbortSignal**          |      ✅       |            ✅             |      ❌      |    ✅    |   ❌    |    ❌    |    ❌    |       ❌       |
| **Progress callback**    |      ✅       |            ✅             |      ❌      |    ❌    |   ❌    |    ❌    |    ❌    |     manual     |
| **Zero-copy memory**     |      ✅       |            ❌             |      ❌      |   N/A    |   ❌    |    ❌    |    ❌    |       ❌       |
| **Strict mode**          |      ✅       |            ❌             |      ✅      |    ❌    |   ❌    |    ❌    |    ❌    |       ❌       |
| **Size guard**           |   ✅ 250 MB   |            ❌             |      ❌      |    ✅    |   ❌    |    ❌    |    ❌    |       ❌       |
| **Magic byte detection** |      ✅       |            ❌             |      ❌      |    ✅    |   ✅    |    ❌    |    ❌    |       ❌       |
| **Multi-threading**      |    ✅ auto    |            ❌             |      ❌      |    ✅    |   ❌    |    ❌    |    ❌    |     manual     |
| **TypeScript**           |   ✅ strict   |            ✅             |    basic     |    ✅    |   ✅    |    ❌    |  basic   |       ✅       |
| **Maintained**           |      ✅       |          ❌ 3yr           |    ❌ 3yr    |    ✅    |   ✅    |    ❌    |  ❌ 4yr  |       ✅       |
| **License**              |      MIT      |            MIT            |     MIT      | Apache-2 |   MIT   | **LGPL** |   MIT    |      LGPL      |

\*sharp supports HEIC with optional `sharp-heif` plugin on supported platforms.

---

## Quality benchmarks

These are from peer-reviewed research and production studies:

### Images

| Comparison                         | Saving             | Source                       |
| ---------------------------------- | ------------------ | ---------------------------- |
| AVIF vs JPEG (same visual quality) | **40–54% smaller** | Google, Cloudflare, Meta     |
| AVIF vs WebP                       | **20–33% smaller** | Cloudflare blog              |
| FFmpeg MozJPEG vs Canvas JPEG      | **5–16% smaller**  | Mozilla Research, Cloudflare |

`omni-compress` uses:

- **OffscreenCanvas** for JPEG/PNG/WebP (hardware-accelerated, matches `compressorjs` quality)
- **Standalone libaom-av1 Wasm** (`@jsquash/avif`) for AVIF — Google's Squoosh encoder, not FFmpeg
- **FFmpeg with MozJPEG** for JPEG on the heavy path — 5-16% better compression than Canvas

### Audio

| Comparison                   | Result                         | Source                |
| ---------------------------- | ------------------------------ | --------------------- |
| Opus 96 kbps vs MP3 128 kbps | Opus wins on perceived quality | IETF listening tests  |
| Opus 96 kbps vs MP3 128 kbps | ~25% smaller file              | OPUS codec whitepaper |

`omni-compress` supports Opus, MP3, FLAC, AAC, and WAV. Use Opus unless you need MP3 specifically.

---

## Architecture: three engines, one API

```
compressImage() / compressAudio() / compressVideo()
        │
        ▼
   ┌─────────┐
   │  Router │  ← Evaluates runtime + format + file size
   └────┬────┘
        │
   ┌────┴────────────────────────────┐
   │                │                │
   ▼                ▼                ▼
Fast Path       Heavy Path       Node Adapter
(Native APIs)  (FFmpeg Wasm)   (child_process)
OffscreenCanvas  @ffmpeg/core-mt  OS ffmpeg binary
WebCodecs A/V    Multi-threaded   No size limit
~0ms overhead    ~30MB Wasm       Full format support
```

### Intelligent routing

The router picks the fastest engine that can handle the request:

- **Small files + fast formats** (JPEG/PNG/WebP images, AAC/Opus audio < 4MB): run on **main thread** via `OffscreenCanvas` / `WebCodecs`. Zero Worker overhead, matches the latency of `compressorjs`.
- **Large files or AVIF**: dispatched to a **Web Worker** (automatic, no config needed). Main thread stays responsive.
- **Formats requiring FFmpeg** (HEIC, FLAC, video, etc.): Web Worker with FFmpeg Wasm singleton. Multi-threaded when `SharedArrayBuffer` is available.
- **Node.js**: always uses native `ffmpeg` binary via `child_process`. No Wasm, no size limit.

---

## Why not just use browser-image-compression?

1. **No AVIF** — the biggest quality/size win in 2024+ is AVIF. browser-image-compression is limited to what `canvas.toBlob()` supports.
2. **No audio, no video** — you need a second library for every other media type.
3. **Abandoned** — last release was 3+ years ago. `omni-compress` is actively maintained.
4. **No Node.js** — you can't share compression code between your client and server.
5. **No `maxSizeMB` in CI** — iterative quality search (#39) is a planned feature.

## Why not just use sharp?

1. **No browser support** — sharp uses native C bindings (libvips). It cannot run in a browser, Cloudflare Workers, or Deno.
2. **No audio/video** — sharp is images only.
3. **Binary install issues** — sharp often fails in Docker, serverless, or edge environments because its native binaries don't match the target platform. `omni-compress` uses pure Wasm in the browser and the host's `ffmpeg` binary in Node.

## Why not just use @ffmpeg/ffmpeg directly?

1. **10+ lines of boilerplate** per operation — VFS write, exec, VFS read, VFS cleanup.
2. **No concurrency management** — concurrent calls to the same FFmpeg instance cause VFS filename collisions. `omni-compress` queues jobs automatically.
3. **No lifecycle management** — you have to manually call `ffmpeg.terminate()` to free memory. `omni-compress` auto-terminates after 30s idle.
4. **No fast path** — `@ffmpeg/ffmpeg` always goes through Wasm, even for operations that OffscreenCanvas could handle in 1ms.
5. **No size guard** — files over 250 MB crash the Wasm memory allocator silently. `omni-compress` throws `FileTooLargeError` before loading.
6. **Wasm only** — no Node.js native path.

---

## Migration guides

- [From browser-image-compression](./migrate-from-browser-image-compression.md)
- [From compressorjs](./migrate-from-compressorjs.md)
- [From jimp](./migrate-from-jimp.md)
- [From lamejs](./migrate-from-lamejs.md)
- [From heic2any](./migrate-from-heic2any.md)
- [From @ffmpeg/ffmpeg](./migrate-from-ffmpeg.md)

## Framework integration guides

- [Next.js](./framework-guides/nextjs.md)
- [Nuxt 3](./framework-guides/nuxt.md)
- [Remix](./framework-guides/remix.md)
- [Astro](./framework-guides/astro.md)
- [Vite + React](./framework-guides/vite-react.md)
- [Vite + Vue](./framework-guides/vite-vue.md)
- [SvelteKit](./framework-guides/sveltekit.md)
- [Express / Node.js](./framework-guides/express.md)
- [Cloudflare Workers](./framework-guides/cloudflare-workers.md)
