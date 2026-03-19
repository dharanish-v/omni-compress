# 📜 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-18

### 🎉 Added
- **Smart Routing Core:** Introduced the `OmniCompressor.process` API to automatically route media processing tasks based on the environment.
- **Browser Fast Path:** Integrated `OffscreenCanvas` and `WebCodecs API` for blazing-fast native processing of standard web formats.
- **Browser Heavy Path:** Implemented dynamic lazy-loading of `@ffmpeg/ffmpeg` via WebAssembly for processing heavy/obscure formats (FLAC, WAV, HEIC, etc.) directly in the browser.
- **Node.js Adapter:** Added a seamless `child_process` adapter that utilizes native OS `ffmpeg` binaries when running in Node.js or Electron, bypassing Wasm overhead entirely.
- **Zero-Copy Memory Management:** Implemented strict `Transferable Object` ArrayBuffer passing between the main thread and Web Workers to eliminate UI freezing and RAM duplication.
- **Wasm Memory Safety:** Added rigorous virtual file system cleanup (`ffmpeg.deleteFile`) after every execution to prevent memory leaks and browser tab crashes.
- **Monorepo Setup:** Transitioned to a Bun Workspaces monorepo containing the core package and a React/Vite playground.
- **Playground UI:** Added a beautiful, Picasso-inspired Tailwind CSS v4 user interface for testing image and audio compression interactively.
