# @dharanish/omni-compress

A universal compression engine built in Rust and WebAssembly.

## 📦 Installation

```bash
npm install @dharanish/omni-compress
```

## 🚀 Usage

### Browser (ESM)

```javascript
import init, { compress_image, compress_zlib } from "@dharanish/omni-compress";

async function run() {
  // 1. Initialize the WASM module
  await init();

  // 2. Compress an image
  const response = await fetch("image.jpg");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const compressedImage = compress_image(bytes, 800, 75);

  // 3. Compress generic data
  const data = new TextEncoder().encode("Hello, World!");
  const compressedData = compress_zlib(data, 6);
}
```

## 🛠️ API

### `compress_image(data: Uint8Array, max_width: number, quality: number): Uint8Array`
Compresses and optionally resizes an image (JPEG, PNG, etc.) using `photon-rs`.

### `compress_zlib(data: Uint8Array, level: number): Uint8Array`
Compresses generic binary data using the Zlib algorithm.

## ⚖️ License
MIT
