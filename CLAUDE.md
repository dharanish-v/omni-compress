# CLAUDE.md — AI Briefing for omni-compress

Read this before touching any file. It replaces the need to explore the codebase from scratch.

---

## What this project is

`omni-compress` (v2.3.7) — a universal, isomorphic compression and archiving library.

- **Isomorphic Core**: ZIP archiving (`archive`) and media processing (`compressImage`, `compressAudio`, `compressVideo`) work identically in browser and Node.js.
- **Browser**: Routes through Web Workers, uses OffscreenCanvas fast path, @jsquash/avif for AVIF, or FFmpeg Wasm heavy path.
- **Node.js**: Spawns native `ffmpeg` binary via `child_process`.
- **Playground**: Astro 6 + React + Tailwind CSS v4 demo app at `apps/playground/`.

---

## Monorepo layout

```
packages/omni-compress/     ← published npm package (`omni-compress`, source of truth)
packages/omni-compress-proxy/ ← deprecated scoped shim published as `@dharanish/omni-compress` (re-exports from omni-compress for backwards compatibility)
packages/vite-plugin-omni-compress/ ← Vite plugin for build-time asset compression (published as `vite-plugin-omni-compress`)
packages/astro-omni-compress/ ← Astro image service implementation (published as `astro-omni-compress`, alternative to sharp)
  src/
    index.ts                ← public entry (named exports), legacy shim
    archive.ts              ← archive() and archiveStream() implementation
    core/
      processor.ts          ← internal _compress() engine (isomorphic)
      router.ts             ← environment detection, fast/heavy path routing
      errors.ts             ← OmniCompressError, FileTooLargeError
      utils.ts              ← fileToArrayBuffer, media detection (isImageFile)
      logger.ts             ← Logger singleton
    adapters/
      browser/
        fastPath.ts         ← OffscreenCanvas (images), WebCodecs stub (audio, unfinished)
        avifEncoder.ts      ← @jsquash/avif standalone libaom-av1 Wasm encoder
        heavyPath.ts        ← FFmpeg Wasm singleton with 30s idle timeout
        workerPool.ts       ← Worker cache, concurrency queue (1 job/type), 60s idle timeout
      node/
        childProcess.ts     ← spawn ffmpeg binary, temp file I/O
    workers/
      image.worker.ts       ← AVIF → FFmpeg heavy path; fast path → heavy path fallback (avifEncoder removed from worker to avoid Emscripten MT sub-worker 404 when SAB is available)
      audio.worker.ts       ← fast path → heavy path fallback
  tests/
    browser/                ← Playwright + Vitest browser tests
    node/                   ← Vitest node tests
    fixtures/               ← sample.png, sample.wav, output.webp

apps/playground/            ← demo app (not published)
  src/
    App.tsx                 ← single React component, all UI logic here
    layouts/Layout.astro    ← head, ClientRouter, prod-only coi-serviceworker
    themes.ts               ← 25 language/persona themes
  public/
    coi-serviceworker.js    ← adds COOP/COEP headers via SW (production only)
    llms.txt / llms-full.txt← AI discoverability standard
  astro.config.mjs          ← base: '/omni-compress', GitHub Pages deploy
```

---

## Critical architecture decisions

### Browser engine routing

```
compressImage() / compressAudio() / compressVideo()
  → _compress() (core/processor.ts)
  → Router.evaluate() → environment: browser | node
  → browser:
      → Dynamic Switching: Files < 4MB using Fast Path or AVIF run on **Main Thread** (High Speed).
      → Worker Pool: Files > 4MB or Heavy Path run in **Web Workers** (Isolation).
      → fileToArrayBuffer → (Main Thread OR WorkerPool)
          → AVIF: @jsquash/avif (standalone libaom-av1 Wasm, 1.1 MB gzipped)
          → FastPath (OffscreenCanvas/WebCodecs): WebP, JPEG, PNG images; AAC, Opus audio
          → HeavyPath (FFmpeg Wasm): everything else, also fallback from FastPath
  → node: childProcess (native ffmpeg binary, no Wasm, no size limit)
```

### Worker concurrency (workerPool.ts)

One active job per worker type (image, audio, video) at a time. The FFmpeg Wasm singleton inside the worker uses fixed VFS filenames — concurrent dispatch causes collisions. Jobs queue and drain automatically. Workers terminate after 60s idle. FFmpeg singleton terminates after 30s idle.

### AVIF encoding (avifEncoder.ts)

- Uses `@jsquash/avif` — standalone libaom-av1 Wasm module from Google's Squoosh project (1.1 MB gzipped)
- NO SharedArrayBuffer required — @jsquash/avif auto-detects multi-threading support
- **Vite bundling caveat (critical):** When SAB is available (COOP/COEP), `@jsquash/avif` init calls `new Worker(new URL("avif_enc_mt.worker.mjs", import.meta.url))`. Vite hashes that filename on build, causing a 404 and worker crash. **Never bundle `@jsquash/avif` into a Vite-processed Web Worker.**
- `avifEncoder.ts` is used by `mainThread.ts` ONLY — for small AVIF files on the main thread (below `avifMainThreadThreshold`).
- `image.worker.ts` routes AVIF to `processImageHeavyPath` (FFmpeg) — NOT to `encodeAVIF` — to avoid the sub-worker 404 crash.
- **Vite config caveat:** Must be excluded from dependency pre-bundling (`optimizeDeps.exclude: ['@jsquash/avif']`) otherwise the Wasm fetch will fail.

### FFmpeg Wasm (heavyPath.ts)

- Uses `@ffmpeg/ffmpeg` v0.12.x + `@ffmpeg/core-mt` (v0.12.6)
- **Multi-threaded** support when `SharedArrayBuffer` is available (Cross-Origin Isolated).
- Singleton reused across calls; VFS cleaned between calls
- 250 MB hard limit (`FileTooLargeError`) before loading into Wasm
- Opus special case: 2-pass (resample to 48kHz WAV → encode) to avoid OOM crash in single-threaded Wasm

### COOP/COEP (SharedArrayBuffer)

- **Dev**: `configure-response-headers` plugin in `astro.config.mjs` adds required headers. `SharedArrayBuffer` is available.
- **Production**: `coi-serviceworker.js` v2 in `Layout.astro` adds COOP/COEP headers via Service Worker and caches Wasm/Worker assets for offline performance.

### Node adapter parity

Node's `childProcess.ts` supports: `preserveMetadata`, `maxWidth`/`maxHeight`, `fps` (video), and basic progress reporting (emits 50% on `time=` in stderr). These are implemented via FFmpeg native flags.

### Build system (tsup)

Two separate build targets:

1. Main library (`index.ts`) — CJS + ESM with code splitting
2. Workers (`image.worker.ts`, `audio.worker.ts`, `video.worker.ts`) — fully self-contained bundles (`noExternal: [/.*/]`), no splitting, loaded as standalone URLs

Workers are exposed via `exports["./workers/*"]` in package.json.

---

## Planned v2.0 API redesign (issue #33)

**Do not implement new features against the current API without checking #33 first.**

The v2.0 design replaces class statics with named function exports for tree-shakeability:

```ts
compressImage(input: File | Blob, options: ImageOptions): Promise<CompressResult>
compressAudio(input: File | Blob, options: AudioOptions): Promise<CompressResult>
archive(entries: ArchiveEntry[], options: ArchiveOptions): Promise<ArchiveResult>
archiveStream(entries: ArchiveEntry[], options: ArchiveOptions): ReadableStream<Uint8Array>
```

`CompressResult` = `{ blob, originalSize, compressedSize, ratio, format }` — not a raw Blob.
`OmniCompressor.process()` stays as a `@deprecated` shim until v3.0.

---

## Open issues — prioritized

### P0: Critical — foundational, do first (everything else builds on these)

| #      | Area     | Summary                                                                                                        | Why first               |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| ~~35~~ | ~~Bug~~  | ~~AVIF incorrectly routed to Fast Path~~ — **Fixed**: AVIF now uses @jsquash/avif (standalone libaom-av1 Wasm) | Resolved.               |
| ~~33~~ | ~~Core~~ | ~~v2.0 API — named exports, CompressResult, AbortSignal, archive support~~                                     | **Resolved in v2.0.0**. |
| ~~23~~ | ~~Core~~ | ~~Typed error hierarchy~~                                                                                      | **Resolved in v2.0.0**. |

### P1: High — high user impact, do next

| #      | Area       | Summary                                                                             | Why high                                                             |
| ------ | ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ~~4~~  | ~~Perf~~   | ~~Service Worker caching for FFmpeg Wasm (~30 MB, re-downloaded every cold start)~~ | **Resolved in v2.1.0**.                                              |
| ~~21~~ | ~~Core~~   | ~~AbortController / cancellation~~                                                  | **Resolved in v2.0.0**.                                              |
| ~~22~~ | ~~Core~~   | ~~Magic byte format detection~~                                                     | **Resolved in v2.0.0**.                                              |
| ~~40~~ | ~~Docs~~   | ~~compressorjs migration guide + compatibility shim~~                               | **Resolved in v2.1.0**.                                              |
| ~~41~~ | ~~UX~~     | ~~Interactive benchmark comparison page in playground~~                             | **Resolved in v2.1.0**.                                              |
| ~~45~~ | ~~Docs~~   | ~~Migration guides for all 6 competitors~~                                          | **Resolved** — all 6 guides in `docs/migrate-from-*.md`.             |
| ~~47~~ | ~~Docs~~   | ~~Why omni-compress comparison page~~                                               | **Resolved** — `docs/why-omni-compress.md` + `/why` playground page. |
| ~~48~~ | ~~Growth~~ | ~~Framework plugins: vite-plugin-omni-compress, astro-omni-compress~~               | **Resolved** — packages created in `packages/`.                      |

### P2: Medium — features, do after P1

| #      | Area     | Summary                                                                                          |
| ------ | -------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~34~~ | ~~Perf~~ | ~~FFmpeg multi-threading via `@ffmpeg/core-mt` (all non-AVIF formats that use FFmpeg)~~          | **Resolved in v2.3.0**.                                                                                                                                                                                  |
| ~~20~~ | ~~Core~~ | ~~WebCodecs audio fast path (AAC + Opus now universal in all browsers, 3-10x faster than Wasm)~~ | **Resolved in v2.3.0**.                                                                                                                                                                                  |
| ~~6~~  | ~~UX~~   | ~~Drag & Drop zone + batch file processing~~                                                     | **Resolved in v2.3.0**.                                                                                                                                                                                  |
| ~~31~~ | ~~Core~~ | ~~Video compression support~~                                                                    | **Resolved in v2.3.0**.                                                                                                                                                                                  |
| ~~42~~ | ~~Core~~ | ~~Video via WebCodecs — H.264/AV1, no FFmpeg needed, 10-50x faster with HW accel~~               | **Resolved in v2.3.0 (Foundation and Heavy Path completed, Fast Path stubbed)**.                                                                                                                         |
| ~~36~~ | ~~Core~~ | ~~`strict` mode — return original if compressed is larger~~                                      | **Resolved in v2.1.0**.                                                                                                                                                                                  |
| ~~37~~ | ~~Core~~ | ~~Image resize modes (`contain`/`cover`/`none`) + `minWidth`/`minHeight`~~                       | **Resolved in v2.3.3**. Also added `width`/`height`, `beforeDraw`/`drew` hooks, `checkOrientation`, `retainExif`, `convertTypes`/`convertSize`, `file` in CompressResult, `setDefaults`/`resetDefaults`. |
| ~~38~~ | ~~Core~~ | ~~Smart format auto-selection (`format: 'auto'`) + PNG→WebP auto-convert~~                       | **Resolved in v2.1.0**.                                                                                                                                                                                  |
| ~~39~~ | ~~Core~~ | ~~Target file size with iterative quality search (enforce `maxSizeMB`)~~                         | **Resolved** — binary search over quality (≤6 passes), `result.quality` reports final quality used. PNG/audio/video skip search (single pass).                                                           |
| 16     | UX       | File reading latency + progress feedback for large files                                         |

### Performance roadmap (Speed-to-#1 initiative)

| #      | Area     | Summary                                                                | Expected Gain                                                                                                                    |
| ------ | -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 55     | Perf     | WebCodecs VideoEncoder — GPU-accelerated H.264/AV1                     | **10-100x faster video**                                                                                                         |
| ~~56~~ | ~~Perf~~ | ~~Parallel archive compression — Promise.all in archive.ts~~           | **Resolved in v2.3.7** — archive() already parallelized; archiveStream() sequential by design (streaming output)                 |
| 57     | Perf     | WebCodecs AudioEncoder rewrite — AudioDecoder→AudioEncoder pipeline    | **3-10x faster audio**                                                                                                           |
| 58     | Perf     | @jsquash/jpeg MozJPEG Wasm — deterministic, smaller JPEG output        | **5-16% smaller JPEG**                                                                                                           |
| ~~59~~ | ~~Perf~~ | ~~Eliminate double bitmap decode in fast path~~                        | **Resolved in v2.3.7** — getImageDimensionsFromHeader moved to utils.ts; avifEncoder.ts uses header parse, single probe fallback |
| 60     | Perf     | @jsquash/oxipng — lossless PNG optimization                            | **20-35% smaller PNG**                                                                                                           |
| 61     | Perf     | FFmpeg speed flags — `-method 0`, `-compression_level 9`, `-threads 0` | **15-30% faster heavy path**                                                                                                     |
| 62     | Perf     | Zero-copy ArrayBuffer transfer — pre-convert before worker dispatch    | **Lower memory, 10-20% faster**                                                                                                  |
| 63     | Perf     | Adaptive worker count (cap 8) + format-aware routing thresholds        | **2x throughput on 8-core**                                                                                                      |
| 64     | Perf     | Optional sharp Node backend — libvips (26x faster than jimp)           | **26x faster Node images**                                                                                                       |

### P3: Low — DX / quality

| #      | Area        | Summary                                                            |
| ------ | ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| ~~27~~ | ~~DX~~      | ~~ESLint + Prettier for core package~~                             | **Resolved**                                                                              |
| ~~32~~ | ~~DX~~      | ~~Husky + lint-staged pre-commit hooks~~                           | **Resolved**                                                                              |
| ~~28~~ | ~~DX~~      | ~~Bundle size tracking and regression prevention in CI~~           | **Resolved**                                                                              |
| ~~24~~ | ~~Testing~~ | ~~Increase test coverage to 80%+~~                                 | **Resolved**                                                                              |
| ~~25~~ | ~~Testing~~ | ~~Cross-browser matrix (Firefox + WebKit)~~                        | **Resolved**                                                                              |
| ~~26~~ | ~~Testing~~ | ~~E2E tests for playground~~                                       | **Resolved**                                                                              |
| ~~5~~  | ~~DX~~      | ~~Automated release management (Changesets / Release-It)~~         | **Resolved**                                                                              |
| ~~46~~ | ~~Docs~~    | ~~Framework integration guides (9 guides)~~                        | **Resolved** — guides in `docs/framework-guides/`.                                        |
| ~~49~~ | ~~Docs~~    | ~~API Documentation Site (TypeDoc)~~                               | **Resolved** — TypeDoc at `/omni-compress/api/`, generated in CI before playground build. |
| ~~50~~ | ~~Growth~~  | ~~GitHub repo optimization (topics, description, social preview)~~ | **Resolved** — topics set, OG image created, issues pinned, awesome-list PRs submitted.   |

### P4: Backlog — nice to have, no timeline

| #      | Area     | Summary                                                              |
| ------ | -------- | -------------------------------------------------------------------- | -------------------------------------------- |
| 13     | UX       | Mobile layout                                                        |
| 29     | UX       | Accessibility audit                                                  |
| 30     | UX       | Clipboard paste + URL import                                         |
| 14     | Core     | Streaming/chunking for files >250 MB (OPFS + JSPI long-term)         |
| 18     | UX       | PWA / offline capabilities                                           |
| ~~43~~ | ~~Docs~~ | ~~Competitive landscape analysis & strategic positioning reference~~ | **Closed** — synthesized into issues #55-64. |

### Recently resolved (v2.3.0)

| #   | Area | Summary                                                          |
| --- | ---- | ---------------------------------------------------------------- |
| 4   | Perf | Service Worker caching for FFmpeg/AVIF Wasm and Workers          |
| 34  | Perf | FFmpeg multi-threading via `@ffmpeg/core-mt`                     |
| 20  | Core | WebCodecs audio fast path (AAC + Opus)                           |
| 6   | UX   | Drag & Drop zone + batch file processing                         |
| 31  | Core | Video compression support (Heavy Path)                           |
| 42  | Core | Video via WebCodecs foundation                                   |
| 36  | Core | `strict` mode logic                                              |
| 38  | Core | Smart format auto-selection                                      |
| 8   | Core | Concurrency queue — serializes FFmpeg jobs per worker type       |
| 10  | UX   | Audio player exclusivity — custom event bus                      |
| 11  | UX   | Mute state persistence — sessionStorage                          |
| 12  | UX   | SAB/COOP-COEP warning banner + coi-serviceworker                 |
| 44  | DX   | Publish unscoped `omni-compress` package for npm discoverability |

---

## Key research findings (March 2026)

Research from issue #43 is closed — fully synthesized into actionable perf issues #55-64. Key findings below:

### Critical bugs

- **#35**: ~~`FAST_PATH_IMAGE_FORMATS` includes `'avif'`, but OffscreenCanvas cannot encode AVIF. Silent wrong output.~~ **Fixed**: AVIF removed from fast path formats. AVIF now routes to a dedicated `@jsquash/avif` encoder (standalone libaom-av1 Wasm from Squoosh). No FFmpeg, no SharedArrayBuffer required.

### Browser APIs

- **WebCodecs AudioEncoder**: AAC + Opus universal in all browsers. MP3 will NEVER be available. FLAC Chrome-only.
- **WebCodecs VideoEncoder**: H.264 + AV1 universal. 10-50x faster than FFmpeg Wasm with HW acceleration.
- **OffscreenCanvas**: JPEG, PNG, WebP only. NO AVIF, NO JPEG XL.
- **JPEG XL**: Chrome removed it. Only Safari supports it. Do not invest.
- **Compression Streams**: `CompressionStream('deflate-raw')` universal. Use `fflate` (11.5 KB) for archive (#33).

### Quality benchmarks (with sources)

- Canvas JPEG (compressorjs) uses libjpeg-turbo. FFmpeg MozJPEG is **5-16% smaller** at same visual quality. (Cloudflare, Mozilla Research)
- AVIF is **40-54% smaller** than JPEG, **20-33% smaller** than WebP. (Google, Cloudflare, Meta)
- AVIF encoding now uses `@jsquash/avif` (standalone libaom-av1 Wasm, 1.1 MB gzipped). Previously extremely slow in single-threaded FFmpeg Wasm (5s-4min). Auto-detects multi-threading without requiring SharedArrayBuffer.
- Opus at 96 kbps outperforms MP3 at 128 kbps (IETF listening tests).

### Competitive positioning — replace 7 libraries with one

omni-compress targets the ENTIRE media compression ecosystem (~4.7M addressable weekly downloads):

| Library                   | DL/wk | What omni-compress replaces                                                               |
| ------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| sharp                     | 36.5M | Node.js path (+ browser, which sharp can't do)                                            |
| jimp                      | 2.25M | Faster, more formats, Web Workers                                                         |
| browser-image-compression | 778K  | Same + FFmpeg fallback + audio + Node.js. **They have AbortSignal — we must match (#21)** |
| heic2any                  | 544K  | HEIC input with any output format                                                         |
| @ffmpeg/ffmpeg            | 377K  | User-friendly layer with lifecycle management                                             |
| compressorjs              | 296K  | Promises, Workers, AVIF, audio, Node.js                                                   |
| pica                      | 111K  | Quality resize + compression in one API                                                   |
| lamejs                    | 61K   | MP3 + every other audio format, MIT not LGPL                                              |

- **fflate** (4.7M/wk): Ideal dependency for archive feature — tiny, fast, zero-dep, streaming ZIP.
- Both browser-image-compression AND compressorjs last published **3+ years ago**.
- Framework integration = #1 growth lever (Sharp grew via Next.js, Zod via tRPC).

### npm discoverability (CRITICAL)

npm switched to OpenSearch (Dec 2024). **Scoped packages (`@dharanish/`) are invisible** in search results. ~~Must publish unscoped `omni-compress` (#44).~~ **Resolved**: The main package (`packages/omni-compress/`) is now published as the unscoped `omni-compress` — the canonical source of truth. `packages/omni-compress-proxy/` publishes as the deprecated `@dharanish/omni-compress` scoped shim (thin re-export for backwards compatibility). CI auto-syncs the proxy version before publishing. Run `npm deprecate "@dharanish/omni-compress@<=2.2.0" "Renamed to omni-compress"` once locally after next release.

### Codec legal status

All codecs safe (MIT-compatible) except AAC (low risk — active Via Licensing patents, but zero open-source enforcement). H.265/HEVC must be avoided for video — use AV1. Full analysis in #43.

### Market gaps omni-compress uniquely fills

1. No isomorphic compression library exists (browser + Node)
2. No browser audio compression library exists on npm
3. No library combines image + audio + video
4. Both top browser competitors stale for 3+ years
5. "audio compression javascript browser" returns zero relevant npm results
6. No client-side library offers `format: 'auto'` (Cloudinary-level intelligence)

---

## Playground-specific rules

- `App.tsx` is one large component (~900 lines) — intentional at this size, not a bug to "fix"
- **When to split**: if App.tsx exceeds ~1200 lines (likely when building #41 benchmark or #6 drag & drop), extract `AudioPlayer`, `CompressionControls`, `ResultDisplay`, `BenchmarkPanel` into `src/components/`. Do it as part of feature work, not as a standalone refactor.
- Theme navigation uses `navigate()` from `astro:transitions/client`, not `<a>` links — Astro prefetch does NOT apply
- `coi-serviceworker.js` in Layout.astro is wrapped in `{import.meta.env.PROD && ...}` — never loads in dev
- Do NOT add `vite.server.headers` for COOP/COEP in `astro.config.mjs` — causes Vite dep-optimization reload loop
- Do NOT add `optimizeDeps.include` for `astro/virtual-modules/*` — they are virtual modules, Vite cannot pre-bundle them

---

## Commands

```bash
bun run dev          # start playground dev server (from apps/playground/)
bun run build        # build playground
bun run test         # run vitest suite (from packages/omni-compress/)
bunx astro check     # type check .astro files

# Publish to npm (via GitHub Actions — do NOT run npm publish locally)
git tag v<version>   # e.g. git tag v1.5.0
git push origin v<version>
# Workflow: .github/workflows/publish.yml — triggers on v* tags
# Steps: typecheck → test → build → npm publish --provenance
```

---

## Working with GitHub issues

**Always read the actual GitHub issue before planning or implementing.**

```bash
gh issue view <number> --repo dharanish-v/omni-compress
```

CLAUDE.md issue summaries are abbreviated. The real issue contains the full action item list, research sources, subtasks, and context. Implementing from the summary alone guarantees missing work. Read the full issue body first — every time, no exceptions.

---

## Coding conventions

- No `Co-Authored-By` tag in commits
- No summary paragraphs at end of responses
- Tests use Vitest (browser + node configs via `vitest.workspace.ts`)
- Workers are imported via Vite's `?worker&url` pattern in the playground, not bundled into the library
- **Always update docs when changing code**: when any source code changes, update all affected documentation:
  - `packages/omni-compress/README.md` — API reference, supported formats, setup guides
  - `apps/playground/scripts/generate-llms-txt.js` — then re-run it (`node scripts/generate-llms-txt.js` in `apps/playground/`) to regenerate `public/llms.txt` and `public/llms-full.txt`
  - `CLAUDE.md` — architecture, routing, known issues, playground rules
