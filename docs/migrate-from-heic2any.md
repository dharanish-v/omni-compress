# Migrate from heic2any to omni-compress

`heic2any` (544K downloads/week) converts HEIC/HEIF images (iPhone photos) to JPEG or PNG in the browser. This guide shows how to replace it with `omni-compress` and gain WebP/AVIF output, Web Workers, and an active maintenance track.

## Why switch?

|                   | heic2any                     | omni-compress    |
| ----------------- | ---------------------------- | ---------------- |
| HEIC → JPEG       | ✅                           | ✅               |
| HEIC → PNG        | ✅                           | ✅               |
| HEIC → WebP       | ❌                           | ✅               |
| HEIC → AVIF       | ❌                           | ✅               |
| Web Workers       | ❌ main thread               | ✅ automatic     |
| Audio compression | ❌                           | ✅               |
| Video compression | ❌                           | ✅               |
| Node.js           | ❌                           | ✅ native ffmpeg |
| AbortSignal       | ❌                           | ✅               |
| Progress          | ❌                           | ✅               |
| Maintained        | ❌ last release 4+ years ago | ✅ active        |

## Quick comparison

```ts
// heic2any
import heic2any from 'heic2any';

const jpeg = await heic2any({
  blob: heicFile,
  toType: 'image/jpeg',
  quality: 0.8,
});

// omni-compress — convert to WebP (smaller, same quality)
import { compressImage } from 'omni-compress';

const { blob, ratio } = await compressImage(heicFile, {
  format: 'webp',
  quality: 0.8,
});

// Or convert to JPEG to match heic2any output exactly:
const { blob: jpeg } = await compressImage(heicFile, {
  format: 'jpeg',
  quality: 0.8,
});
```

## API mapping

| heic2any                                            | omni-compress                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `heic2any({ blob, toType: 'image/jpeg', quality })` | `compressImage(file, { format: 'jpeg', quality })`               |
| `heic2any({ blob, toType: 'image/png' })`           | `compressImage(file, { format: 'png' })`                         |
| Returns `Promise<Blob>`                             | Returns `Promise<{ blob, ratio, originalSize, compressedSize }>` |
| `quality` (0–1)                                     | `quality` (0–1)                                                  |
| `multiple: true` → `Blob[]`                         | ⚠️ single image only (see gaps)                                  |

## How HEIC decoding works in omni-compress

In the **browser**, HEIC files are decoded by FFmpeg Wasm (the heavy path). This requires `SharedArrayBuffer` for multi-threaded FFmpeg — if your page has Cross-Origin Isolation headers, it runs multi-threaded and is faster. Without those headers, it falls back to single-threaded Wasm (slower but still works).

In **Node.js**, the native `ffmpeg` binary handles HEIC decoding natively — no Wasm, no headers needed.

## Examples

### React — handle iPhone photo uploads

```tsx
import { compressImage } from 'omni-compress';
import { useState } from 'react';

export function HeicUploader() {
  const [status, setStatus] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Converting HEIC...');
    const { blob, ratio } = await compressImage(file, {
      format: 'webp', // WebP is ~30% smaller than JPEG at same quality
      quality: 0.85,
      onProgress: (p) => setStatus(`${p}%`),
    });

    const formData = new FormData();
    formData.append('photo', blob, 'photo.webp');
    await fetch('/api/photos', { method: 'POST', body: formData });
    setStatus(`Saved ${Math.round((1 - ratio) * 100)}%`);
  }

  return (
    <input type="file" accept="image/heic,image/heif,.heic,.heif,image/*" onChange={handleFile} />
  );
}
```

### Next.js — compress iPhone photos client-side before S3 upload

```tsx
// app/upload/page.tsx
'use client';
import { compressImage } from 'omni-compress';

export default function PhotoUpload() {
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const { blob } = await compressImage(file, {
      format: 'webp',
      quality: 0.85,
    });

    // Get a presigned S3 URL and upload directly from browser
    const { url } = await fetch('/api/presign').then((r) => r.json());
    await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/webp' } });
  }

  return <input type="file" accept="image/*,.heic,.heif" onChange={upload} />;
}
```

### Node.js — process HEIC uploads on the server

```ts
import { compressImage } from 'omni-compress';
import express from 'express';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post('/photos', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const file = new Blob([req.file.buffer], { type: req.file.mimetype });

  // Convert HEIC → WebP on the server, save bandwidth vs sending HEIC back
  const { blob, ratio } = await compressImage(file, {
    format: 'webp',
    quality: 0.85,
    maxWidth: 2048,
  });

  // Save or return the WebP
  res.json({ savedPercent: Math.round((1 - ratio) * 100) });
});
```

## Honest gaps

- **Multi-page HEIC (`multiple: true`):** `heic2any` can convert each frame of a multi-page HEIC/HEIF into a separate Blob. `omni-compress` converts only the first frame. If you need multi-page HEIC burst photos converted to individual frames, keep `heic2any` for that specific use case.
- **Browser HEIC support:** Like `heic2any`, browser-side HEIC decoding in `omni-compress` uses a Wasm-based decoder (FFmpeg). This adds ~30 MB of Wasm to download on cold start (mitigated by Service Worker caching in production builds).

## Step-by-step migration

1. `npm uninstall heic2any`
2. `npm install omni-compress`
3. Replace `import heic2any from 'heic2any'` with `import { compressImage } from 'omni-compress'`
4. Replace `heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 })` with `compressImage(file, { format: 'jpeg', quality: 0.8 })`
5. Switch `toType: 'image/jpeg'` → `format: 'webp'` to get 20-30% smaller output for free
6. Access the blob via `result.blob` instead of using the returned value directly

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
