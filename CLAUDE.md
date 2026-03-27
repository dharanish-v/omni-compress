# CLAUDE.md — AI Briefing for omni-compress

Read this before touching any file. It replaces the need to explore the codebase from scratch.

---

## What this project is

`@dharanish/omni-compress` (v1.5.0) — an isomorphic media compression library.
- **One API** (`OmniCompressor.process(file, options): Promise<Blob>`) works identically in browser and Node.js
- **Browser**: routes through Web Workers (off main thread), uses OffscreenCanvas fast path or FFmpeg Wasm heavy path
- **Node.js**: spawns native `ffmpeg` binary via `child_process`
- **Playground**: Astro 6 + React + Tailwind CSS v4 demo app at `apps/playground/`

---

## Monorepo layout

```
packages/omni-compress/     ← published npm package (@dharanish/omni-compress)
  src/
    index.ts                ← single public entry, re-exports everything
    core/
      router.ts             ← environment detection, fast/heavy path routing
      errors.ts             ← OmniCompressError, FileTooLargeError
      utils.ts              ← fileToArrayBuffer, assertFileSizeWithinLimit, SAFE_SIZE_LIMITS
      logger.ts             ← Logger singleton
    adapters/
      browser/
        fastPath.ts         ← OffscreenCanvas (images), WebCodecs stub (audio, unfinished)
        heavyPath.ts        ← FFmpeg Wasm singleton with 30s idle timeout
        workerPool.ts       ← Worker cache, concurrency queue (1 job/type), 60s idle timeout
      node/
        childProcess.ts     ← spawn ffmpeg binary, temp file I/O
    workers/
      image.worker.ts       ← fast path → heavy path fallback
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
OmniCompressor.process()
  → Router.evaluate() → environment: browser | node
  → browser: fileToArrayBuffer → WorkerPool → Worker
      → FastPath (OffscreenCanvas): WebP, AVIF, JPEG, PNG images only
      → HeavyPath (FFmpeg Wasm): everything else, also fallback from FastPath
  → node: childProcess (native ffmpeg binary, no Wasm, no size limit)
```

### Worker concurrency (workerPool.ts)
One active job per worker type at a time. The FFmpeg Wasm singleton inside the worker uses fixed VFS filenames — concurrent dispatch causes collisions. Jobs queue and drain automatically. Workers terminate after 60s idle. FFmpeg singleton terminates after 30s idle.

### FFmpeg Wasm (heavyPath.ts)
- Uses `@ffmpeg/core` — **single-threaded** (not `@ffmpeg/core-mt`)
- `ffmpeg.load()` called with no args — uses bundled core, served same-origin
- Singleton reused across calls; VFS cleaned between calls
- 250 MB hard limit (`FileTooLargeError`) before loading into Wasm
- Opus special case: 2-pass (resample to 48kHz WAV → encode) to avoid OOM crash in single-threaded Wasm

### COOP/COEP (SharedArrayBuffer)
- **Dev**: No headers. `SharedArrayBuffer` may be unavailable. FFmpeg still works (single-threaded core doesn't require SAB).
- **Production**: `coi-serviceworker.js` in `Layout.astro` adds COOP/COEP headers via Service Worker. One bootstrap reload on first visit. `crossOriginIsolated = true` after that.
- SAB missing banner in `App.tsx` is **prod-only** (`import.meta.env.DEV` guard) — was a false alarm in dev since the single-threaded core doesn't need SAB.

### Node adapter gaps vs browser
Node's `childProcess.ts` is missing: `preserveMetadata`, `maxWidth`/`maxHeight`, real progress reporting (emits fake 50% on `time=` in stderr). These are tracked but not yet implemented.

### Build system (tsup)
Two separate build targets:
1. Main library (`index.ts`) — CJS + ESM with code splitting
2. Workers (`image.worker.ts`, `audio.worker.ts`) — fully self-contained bundles (`noExternal: [/.*/]`), no splitting, loaded as standalone URLs

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

| # | Area | Summary | Why first |
|---|------|---------|-----------|
| 35 | Bug | AVIF incorrectly routed to Fast Path — OffscreenCanvas cannot encode AVIF | Silent wrong output. Fix before any other work. |
| 33 | Core | v2.0 API — named exports, CompressResult, AbortSignal, archive support | All new features should target v2.0. Building against current API creates debt. |
| 23 | Core | Typed error hierarchy | Part of v2.0 API surface. Needs to ship with #33. |

### P1: High — high user impact, do next

| # | Area | Summary | Why high |
|---|------|---------|---------|
| 4  | Perf | Service Worker caching for FFmpeg Wasm (~30 MB, re-downloaded every cold start) | Biggest perceived-performance win. Eliminates only UX advantage of compressorjs. |
| 21 | Core | AbortController / cancellation | Users navigate away mid-compression. Orphaned Wasm jobs leak memory silently. |
| 22 | Core | Magic byte format detection | Silent failures when file extension ≠ content. Safety/correctness issue. |
| 40 | Docs | compressorjs migration guide + compatibility shim | Fastest adoption path for 293K weekly downloads. |
| 41 | UX | Interactive benchmark comparison page in playground | Proof > claims. Visual compression comparison. |

### P2: Medium — features, do after P1

| # | Area | Summary |
|---|------|---------|
| 34 | Perf | FFmpeg multi-threading via `@ffmpeg/core-mt` (all prerequisites met) |
| 20 | Core | WebCodecs audio fast path (AAC + Opus now universal in all browsers, 3-10x faster than Wasm) |
| 6  | UX | Drag & Drop zone + batch file processing |
| 31 | Core | Video compression support |
| 42 | Core | Video via WebCodecs — H.264/AV1, no FFmpeg needed, 10-50x faster with HW accel |
| 36 | Core | `strict` mode — return original if compressed is larger |
| 37 | Core | Image resize modes (`contain`/`cover`/`none`) + `minWidth`/`minHeight` |
| 38 | Core | Smart format auto-selection (`format: 'auto'`) + PNG→WebP auto-convert |
| 39 | Core | Target file size with iterative quality search (enforce `maxSizeMB`) |
| 16 | UX | File reading latency + progress feedback for large files |

### P3: Low — DX / quality

| # | Area | Summary |
|---|------|---------|
| 27 | DX | ESLint + Prettier for core package |
| 32 | DX | Husky + lint-staged pre-commit hooks |
| 28 | DX | Bundle size tracking and regression prevention in CI |
| 24 | Testing | Increase test coverage to 80%+ |
| 25 | Testing | Cross-browser matrix (Firefox + WebKit) |
| 26 | Testing | E2E tests for playground |
| 5  | DX | Automated release management (Changesets / Release-It) |

### P4: Backlog — nice to have, no timeline

| # | Area | Summary |
|---|------|---------|
| 13 | UX | Mobile layout |
| 29 | UX | Accessibility audit |
| 30 | UX | Clipboard paste + URL import |
| 14 | Core | Streaming/chunking for files >250 MB (OPFS + JSPI long-term) |
| 18 | UX | PWA / offline capabilities |
| 43 | Docs | Competitive landscape analysis & strategic positioning reference |

### Recently resolved (v1.5.0)

| # | Area | Summary |
|---|------|---------|
| 8  | Core | Concurrency queue — serializes FFmpeg jobs per worker type, prevents VFS filename collisions |
| 10 | UX | Audio player exclusivity — custom event bus pauses other players when one starts |
| 11 | UX | Mute state persistence — sessionStorage read/write with `hasMuteRestoredRef` race-condition guard |
| 12 | UX | SAB/COOP-COEP warning banner — prod-only guard; coi-serviceworker added to Layout.astro |

---

## Key research findings (March 2026)

### AVIF fast path bug
`FAST_PATH_IMAGE_FORMATS` in `router.ts` includes `'avif'`, but `OffscreenCanvas.convertToBlob()` does NOT support AVIF encoding in any browser. AVIF must always route to Heavy Path (FFmpeg libaom-av1). Tracked as #35.

### WebCodecs is now universal
- **AudioEncoder**: AAC and Opus available in Chrome, Firefox, Safari. MP3 encoding will NEVER be available via WebCodecs. FLAC is Chrome-only.
- **VideoEncoder**: H.264 and AV1 available in all browsers. 10-50x faster than FFmpeg Wasm with hardware acceleration.
- **Impact**: Audio fast path (#20) can handle AAC + Opus without FFmpeg. Video (#31, #42) can use WebCodecs + mp4box.js instead of FFmpeg.

### OffscreenCanvas format limitations
- Supports: JPEG, PNG, WebP
- Does NOT support: AVIF, JPEG XL (these must go through FFmpeg Heavy Path)
- JPEG XL: Chrome removed support entirely. Only Safari supports it. Do not invest.

### FFmpeg Wasm caching (#4)
Extend `coi-serviceworker.js` with Cache API (~20-30 lines). Cache key: `ffmpeg-wasm-v{version}`. First visit downloads; every subsequent visit is instant from Cache API.

### Compression Streams API
`CompressionStream('deflate-raw')` is universal. ZIP archive support (#33) needs zero Wasm — use `fflate` (14 KB) or native `CompressionStream`.

### Primary competitor: compressorjs
293K weekly downloads, 5.7K stars. **Stale since Feb 2023.** Browser-only, main-thread blocking, image-only, no AVIF, no HEIC, callback API. Canvas output varies by browser. Full analysis in #43.

---

## Playground-specific rules

- `App.tsx` is one large component — intentional, not a bug to "fix"
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

## Coding conventions

- No `Co-Authored-By` tag in commits
- No summary paragraphs at end of responses
- Tests use Vitest (browser + node configs via `vitest.workspace.ts`)
- Workers are imported via Vite's `?worker&url` pattern in the playground, not bundled into the library
