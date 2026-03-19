# 🗜️ Omni Compress

<p align="center">
  <img src="https://img.shields.io/npm/v/@dharanish/omni-compress?style=flat-square&color=0f4c81" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/dharanish-v/omni-compress?style=flat-square&color=5386b4" alt="License" />
  <img src="https://img.shields.io/npm/dt/@dharanish/omni-compress?style=flat-square&color=c06c5b" alt="NPM Downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/dharanish-v/omni-compress/ci.yml?branch=main&style=flat-square&color=d9a05b" alt="CI Status" />
</p>

A zero-compromise, hyper-optimized media processing abstraction layer for modern web and Node.js applications.

`omni-compress` is a smart-routing media library. It accepts an image or audio `File` (or `Blob` / `ArrayBuffer`), evaluates the runtime environment, and dynamically routes the compression task to the most performant engine available.

It guarantees **100% format support** by falling back to WebAssembly when necessary, while rigorously protecting your bundle size by attempting to use native 0-byte Web APIs first.

The library is designed for both frontend (React, Vue, Svelte) and backend (Node.js, Electron) environments.

---

## ✨ Features

- **⚡ Zero Main-Thread Blocking:** ALL processing in the browser occurs seamlessly inside Web Workers.
- **🚀 Zero-Copy Memory Transfers:** Uses `Transferable Objects` (`ArrayBuffers`) when passing data between the Main Thread and Web Workers, preventing RAM duplication and UI freezing.
- **📦 Dynamic Imports:** Wasm dependencies (`@ffmpeg/ffmpeg`) are lazily imported ONLY when the Heavy Path is triggered.
- **🧹 Wasm Memory Safety:** Explicit memory cleanup and virtual file system management after every single execution to prevent memory leaks and tab crashes.
- **🖥️ Node.js / Electron Support:** Automatically detects Node environments and bypasses Wasm entirely to spawn native OS child processes (`ffmpeg`) for maximum backend performance.
- **🌲 Tree-Shaking Ready:** Built as a modern ESM package with conditional exports and no side effects.

## 📦 Installation

```bash
# Using npm
npm install @dharanish/omni-compress

# Using bun
bun add @dharanish/omni-compress

# Using pnpm
pnpm add @dharanish/omni-compress
```

## 🚀 Quick Start

The consumer only needs to interact with a single, unified interface:

```typescript
import { OmniCompressor } from '@dharanish/omni-compress';

async function compressMyFile(inputFile: File) {
  try {
    const outputBlob = await OmniCompressor.process(inputFile, {
      type: "image", // or 'audio'
      format: "webp", // e.g., 'webp', 'avif', 'jpeg', 'mp3', 'flac'
      quality: 0.8, // 0.0 to 1.0 (for lossy formats)
      onProgress: (percent) => {
        console.log(`Compression Progress: ${percent}%`);
      },
    });

    console.log("Compression successful!", outputBlob);
    return outputBlob;
  } catch (error) {
    console.error("Compression failed:", error);
  }
}
```

## 🧠 Architecture: The Smart Router

When you call `OmniCompressor.process`, the library evaluates the payload and routes it through one of three paths:

1. **Fast Path (Native Web):**
   If the file is a standard web format (JPG, PNG, WebM) and the environment is a Browser, we do **not** load Wasm. We use `OffscreenCanvas` (Images) and `WebCodecs API` (Audio) inside a Web Worker.
2. **Heavy Path (Wasm Fallback):**
   If the file is an obscure format (HEIC, TIFF, FLAC, WAV), we dynamically lazy-load WebAssembly micro-engines (`@ffmpeg/ffmpeg`) inside a Web Worker.
3. **Node/Electron Adapter:**
   If `process.versions.node` is detected, we bypass Wasm and Native Web APIs entirely. The library spawns a native `child_process` to use OS binaries.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to set up the repository, run the playground, and submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
