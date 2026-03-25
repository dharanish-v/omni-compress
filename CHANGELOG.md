# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - *Core Library:* Expanded `CompressorOptions` API to accept `maxWidth`, `maxHeight`, `preserveMetadata`, `bitrate`, `channels`, and `sampleRate`. Implemented these flags across both Fast (OffscreenCanvas) and Heavy (FFmpeg Wasm) routing paths.
  - *Playground UI:* Added a Neo-Brutalist "Advanced Engineering" collapsible panel to expose granular controls (Quality slider, resizing, audio bitrates/channels) to the end user.
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
