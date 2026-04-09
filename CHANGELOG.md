# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.1] - 2026-04-09

### Added

- **API Documentation Site (#49):** TypeDoc-generated HTML reference auto-deployed at [`/omni-compress/api/`](https://dharanish-v.github.io/omni-compress/api/) on every CI run. Covers all public functions, options interfaces, error classes, and types with full TSDoc.
- **Social Preview / OG Meta Tags (#50):** 1280×640 Neo-Brutalist SVG social preview (`public/og-social-preview.svg`). Added `og:image`, `og:url`, and `twitter:image` meta tags to `Layout.astro`.
- **Awesome List Submissions (#50):** PRs submitted to `sorrycc/awesome-javascript` and `mbasso/awesome-wasm`.
- **Playground API Docs Link:** Footer now includes an "API Docs" link.

### Changed

- **Full TSDoc coverage:** Added `@param`/`@returns`/`@example` to `fileToArrayBuffer`, `arrayBufferToBlob`, `getMimeType`, `Router` class (all methods), and `Logger` class (all methods).
- **SECURITY.md:** 2.x is now the supported version; 1.x is EOL.
- **CONTRIBUTING.md:** Added `bun run docs` command and updated project structure.

## [2.3.0] - 2026-04-08

### Changed

- **Package Rename (Issue #44):** The library is now published as the unscoped `omni-compress` package on npm for better discoverability.
- **Legacy Shim:** The original `@dharanish/omni-compress` package is now a deprecated shim that re-exports `omni-compress` for backwards compatibility.
- **Documentation Overhaul:** Updated all READMEs, documentation, and playground imports to reflect the new package name.

## [2.2.0] - 2026-04-07

### Added

- **Intelligent Threading:** Implemented a high-speed main-thread path for small files (< 4MB) to eliminate Web Worker communication overhead when using native engines or standalone AVIF.
- **Multi-Worker Scaling:** Optimized the worker pool for parallel processing of different media types.
- **Resize-on-Decode:** Integrated native browser resizing during the decoding phase for improved performance on large images.
- **Video Compression support** (Heavy Path) for MP4 and WebM.

## [2.1.0] - 2026-04-02

### Added

- **Smart Mode:** Added `format: 'auto'` for automatic selection of the best compression format.
- **Strict Mode:** Added `strict: true` to return the original file if the compressed version is larger.
- **Drag & Drop Support:** Enhanced playground UI with intuitive file handling and batch uploads.
- **Service Worker caching** for FFmpeg/AVIF Wasm and Workers.

## [2.0.0] - 2026-03-30

### Added

- **Named Export API (Issue #33):** Replaced class-based `OmniCompressor.process()` with tree-shakeable named exports: `compressImage()`, `compressAudio()`, `archive()`, and `archiveStream()`.
- **Smart Archive Support:** The `archive()` function now supports a `smartOptimize` option to automatically pre-compress media files to optimized formats (WebP/MP3) before zipping.
- **Node Adapter Parity:** The Node.js adapter now supports `maxWidth`, `maxHeight`, `preserveMetadata`, and audio flags (`bitrate`, `channels`, `sampleRate`), achieving parity with the browser engine.
- **Improved progress reporting** in both browser and Node.js environments.
- **Typed `CompressResult`:** v2.0 functions now return a structured object with metadata (`blob`, `originalSize`, `compressedSize`, `ratio`, `format`) instead of a raw Blob.

### Changed

- **Architecture Refactor:** Extracted the isomorphic compression engine into `core/processor.ts` to support complex batch operations and avoid circular dependencies.
- **Deprecated Legacy API:** `OmniCompressor.process()` is now marked as `@deprecated` and will be removed in v3.0.

## [1.5.0] - 2026-03-29

### Added

- **Native AVIF Encoding (Issue #35):** Integrated `@jsquash/avif` (standalone libaom-av1 Wasm) for high-performance AVIF encoding without requiring `SharedArrayBuffer` or COOP/COEP headers.
- **Worker Concurrency Queue:** Implemented a job queue in `workerPool.ts` to serialize FFmpeg Wasm tasks, preventing VFS filename collisions and improving stability.
- **Persona Theme Persistence:** Mute state and other UI preferences now persist across Astro view transitions.

## [1.4.0] - 2026-03-25

### Added

- **Fast Path Fallback (Issue #9):** Fast Path failures (e.g., missing `OffscreenCanvas` or `WebCodecs` support) now automatically fall back to the Heavy Path (FFmpeg Wasm) instead of throwing an unrecoverable error. This ensures maximum resilience across browser environments.
- **File Size Guard (Issue #7):** Core library now throws a typed `FileTooLargeError` before loading files exceeding 250 MB into WebAssembly, preventing opaque OOM crashes. The Node.js adapter is unaffected (no Wasm memory limit). Defense-in-depth checks are also enforced at the Wasm boundary inside the Heavy Path.
- **Typed Error Hierarchy:** Introduced `OmniCompressError` base class and `FileTooLargeError` subclass with machine-readable `code` fields and contextual metadata (`fileSize`, `maxSize`). All error classes are exported from the public API.
- **Playground File Size Limit (Issue #15):** Playground UI enforces a 250 MB hard limit with a Neo-Brutalist error banner. Oversized files are rejected before loading into `<img>` or `<audio>` tags.

### Changed

- **FFmpeg Singleton Caching (Issue #1):** FFmpeg Wasm instance is now cached and reused across compressions within the same Web Worker. The Virtual File System is cleaned per-operation; the instance self-terminates after 30 seconds of idle. Workers themselves are cached with a 60-second idle timeout. This eliminates redundant Wasm cold-starts for sequential operations.
- **Production Source Maps Disabled (Issue #1):** Source maps are no longer emitted in production builds (`NODE_ENV=production`), reducing unpacked package size from ~200 KB to ~84 KB.
- **Vite Dev Compatibility:** Excluded `@ffmpeg/ffmpeg` and `@ffmpeg/util` from Vite's dependency optimizer to prevent stale pre-bundling of FFmpeg's internal worker.
- **Structured Logging:** Replaced all raw `console.*` statements in workers, worker pool, and Node adapter with the structured `logger` for consistent, level-aware logging across the entire codebase.
- **Publish Workflow Hardened:** Added Playwright install and test run to the npm publish workflow to prevent publishing untested code.

## [1.3.0] - 2026-03-24

### Added

- **Automated Test Suite (Issue #3):** Implemented a robust, isomorphic test suite using Vitest workspaces. Evaluates the `child_process` adapter in a Node environment and the `OffscreenCanvas`/Web Worker Wasm engines in a real headless Chromium browser powered by Playwright. Integrated into the GitHub Actions CI pipeline.
- **SSG Migration for SEO (Issue #2):** Migrated the Playground from a Vite SPA to Astro. Implemented `getStaticPaths` to pre-render all 26 persona themes into distinct, indexable HTML pages with dynamic SEO `<meta>` tags and an auto-generated `sitemap-index.xml`.
- **Advanced Output Controls (Issue #17):**
  - _Core Library:_ Expanded `CompressorOptions` API to accept `maxWidth`, `maxHeight`, `preserveMetadata`, `bitrate`, `channels`, and `sampleRate`. Implemented these flags across both Fast (OffscreenCanvas) and Heavy (FFmpeg Wasm) routing paths.
  - _Playground UI:_ Added a Neo-Brutalist "Advanced Engineering" collapsible panel to expose granular controls (Quality slider, resizing, audio bitrates/channels) to the end user.
- **LLM Discoverability Standard (Issue #19):** Implemented an automated build script to generate `llms.txt` (concise API summary) and `llms-full.txt` (concatenated project documentation) to the root of the static site, optimizing the repository for AI agents and coding assistants.

### Changed

- Preserved the seamless View Transitions during the Astro SSG migration by utilizing Astro's `<ClientRouter />` and `navigate()` API instead of standard `<a>` tag routing.
- Added Neo-Brutalist sticky footer to the playground featuring author copyright and Open Source links.

## [1.2.0] - 2026-03-22

### Added

- **Neo-Brutalist UI Overhaul:** Complete redesign of the Playground with a raw, high-contrast aesthetic.
- **26 Persona Themes:** Persona-driven themes ranging from Shakespeare to Aryabhata, each with unique color palettes, background patterns, and cultural quotes.
- **Mechanical Audio Player:** Custom-built audio component featuring a stylized "digital readout" for duration and a tactile "mechanical knob" for seeking.
- **Brutalist Select Components:** Replaced native dropdowns with custom Neo-Brutalist selectors that follow the theme's color palette and haptic feedback system.
- **Haptic Interaction & Sound Synthesis:** Standardized 6px offset shadows and 1:1 translation for a tactile, physical feel. Paired with actual **Haptic Vibrations** (`navigator.vibrate`) and **Synthesized Mechanical Sounds** (Web Audio API) for ultra-low latency sensory feedback.
- **Transformation Flow Visuals:** Desktop-only "conversion arrow" between media cards and a progress-fill animation on the compression button to visualize the transformation process.
- **Global Brutalist Scrollbar:** Custom scrollbar styling in `index.css` that reflects the project's heavy-bordered, high-contrast identity.
- **Design Thinking Documentation:** Added comprehensive design philosophy and Neo-Brutalist principles to the playground README.

### Changed

- Refined typography and spacing for better readability in high-contrast modes.
- Improved media card accessibility and contrast across all 26 themes.
- Updated View Transitions logic for smoother persona switching.

### Fixed

- URL Revocation Bug: Fixed a race condition where the original media URL was prematurely revoked after compression, preventing side-by-side comparison.

## [1.1.0] - 2026-03-20

### Added

- Input validation on `OmniCompressor.process()` — invalid `type`, `format`, or `quality` now throw descriptive errors instead of silently propagating.
- Comprehensive API reference, supported formats table, architecture diagram, framework examples (React, Vue, Node), bundler configuration, troubleshooting guide, and browser compatibility table in the README.
- `SECURITY.md` vulnerability reporting policy.
- `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
- GitHub issue templates (bug report + feature request) and pull request template.
- `.editorconfig` for consistent formatting across editors.
- Type-checking step (`tsc --noEmit`) in CI and publish workflows.
- PR trigger for CI workflow — CI now runs on pull requests targeting `master`.
- npm provenance support in publish workflow.
- `typecheck` script to package.json.
- Export `LogLevel` type for consumers.
- `repository`, `homepage`, `bugs`, and `keywords` fields to package.json for npm discoverability.

### Changed

- Used the library's structured `logger` throughout `heavyPath.ts` instead of raw `console.*` calls for consistent, level-aware logging.
- Replaced `Math.random()` with `crypto.randomUUID()` for temp file names in the Node adapter (security hardening).
- Removed `processWithNode: any` typing — now properly typed against the actual export.
- Moved `ffmpeg-static` from `dependencies` to `optionalDependencies` so browser-only consumers don't download a 70 MB binary they'll never use.
- Removed unused `@ffmpeg/util` from dependencies.
- Package README is now shipped as-is to npm (publish workflow no longer overwrites it with the root README).
- Root README is now a concise monorepo overview; the package README contains the full API reference.
- CI badge now correctly points to `master` branch instead of `main`.
- Conditional GitHub Pages deployment — only deploys on pushes to `master`, not on PRs.

### Fixed

- CI badge in README pointed to `branch=main` but the default branch is `master`.
- Publish workflow was overwriting the package README with the root README.
- `files` field in package.json now explicitly includes `LICENSE` and `README.md`.

## [1.0.6] - 2026-03-18

### Fixed

- Use `.npmrc` for `bun publish` authentication.

## [1.0.5] - 2026-03-18

### Changed

- Switched to native `bun publish`.

## [1.0.4] - 2026-03-18

### Fixed

- Missing README on npm package page.

## [1.0.3] - 2026-03-18

### Fixed

- CI branch trigger updated from `main` to `master`.
- Removed GitHub Packages publishing (npm-only).

## [1.0.2] - 2026-03-18

### Fixed

- npm workspace flag for publishing.

## [1.0.1] - 2026-03-18

### Fixed

- Clean publish to npm registry.

## [1.0.0] - 2026-03-18

### Added

- **Smart Routing Core:** `OmniCompressor.process` API with automatic environment-based routing.
- **Browser Fast Path:** `OffscreenCanvas` and `WebCodecs API` for native processing of standard web formats.
- **Browser Heavy Path:** Dynamic lazy-loading of `@ffmpeg/ffmpeg` via WebAssembly for heavy/obscure formats (FLAC, WAV, HEIC, etc.).
- **Node.js Adapter:** `child_process` adapter using native OS `ffmpeg` binaries, bypassing Wasm entirely.
- **Zero-Copy Memory Management:** `Transferable Object` ArrayBuffer passing between main thread and Web Workers.
- **Wasm Memory Safety:** Virtual file system cleanup (`ffmpeg.deleteFile`) and `ffmpeg.terminate()` after every execution.
- **Monorepo Setup:** Bun Workspaces monorepo with core package and React/Vite playground.
- **Playground UI:** Picasso-inspired Tailwind CSS v4 demo for interactive testing.
