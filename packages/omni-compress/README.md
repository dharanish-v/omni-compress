# omni-compress

[![CI](https://github.com/dharanish-v/omni-compress/actions/workflows/ci.yml/badge.svg)](https://github.com/dharanish-v/omni-compress/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@dharanish/omni-compress.svg)](https://www.npmjs.com/package/@dharanish/omni-compress)

**omni-compress** is a high-performance, universal compression library built with Rust and WebAssembly. It aims to provide a unified API for compressing everything from images and generic archives to documents and media, running at native speeds in the browser.

## 🚀 Features

- 🖼️ **Images**: Smart JPEG/PNG/WebP compression with resizing (powered by `photon-rs`).
- 📦 **Archives**: Generic Zlib, Gzip, and Zip support.
- ⚡ **WASM-First**: Built with Rust for maximum performance and security.
- 🌍 **Universal**: Works in browsers, Node.js, Bun, and Deno.
- 🛠️ **Monorepo**: Includes a playground app to benchmark and test features.

## 📂 Repository Structure

```text
.
├── apps/
│   └── playground/      # React + Vite benchmarking app
├── packages/
│   └── omni-compress/   # Core Rust WASM library
└── .github/             # CI/CD Workflows (Auto-publish to NPM/JSR/GitHub)
```

## 🛠️ Quick Start

### For Developers (Monorepo)

1.  **Clone the repo**:
    ```bash
    git clone https://github.com/dharanish-v/omni-compress.git
    cd omni-compress
    ```

2.  **Install dependencies**:
    ```bash
    bun install
    ```

3.  **Build the WASM library**:
    ```bash
    bun run build:rust
    ```

4.  **Run the playground**:
    ```bash
    bun run dev:client
    ```

### For Users (npm)

```bash
npm install @dharanish/omni-compress
```

## 📖 Usage

```javascript
import init, { compress_image } from "@dharanish/omni-compress";

async function run() {
  await init(); // Initialize WASM module
  
  const originalBytes = ...; // Your file bytes
  const compressed = compress_image(originalBytes, 800, 75); // Resize to 800px, 75% quality
}
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
