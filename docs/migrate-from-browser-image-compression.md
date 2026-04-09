# Migrate from browser-image-compression to omni-compress

`browser-image-compression` (778K downloads/week) is the most popular browser image compression library. This guide shows you how to switch to `omni-compress` and what you gain.

## Why switch?

|                     | browser-image-compression    | omni-compress                       |
| ------------------- | ---------------------------- | ----------------------------------- |
| Images              | ✅ JPEG, PNG, WebP           | ✅ JPEG, PNG, WebP, AVIF            |
| Audio               | ❌                           | ✅ Opus, MP3, FLAC, AAC, WAV        |
| Video               | ❌                           | ✅ MP4, WebM                        |
| Node.js             | ❌                           | ✅ native ffmpeg                    |
| AVIF encoding       | ❌                           | ✅ standalone libaom-av1 Wasm       |
| AbortSignal         | ✅                           | ✅                                  |
| Progress            | ✅                           | ✅                                  |
| Web Workers         | ✅ opt-in                    | ✅ automatic                        |
| Zero-copy transfers | ❌                           | ✅ Transferable ArrayBuffer         |
| Multi-threading     | ❌                           | ✅ SharedArrayBuffer when available |
| TypeScript          | ✅                           | ✅ strict                           |
| Maintained          | ❌ last release 3+ years ago | ✅ active                           |

## Quick comparison

```ts
// browser-image-compression
import imageCompression from 'browser-image-compression';

const compressed = await imageCompression(file, {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  onProgress: (p) => console.log(p + '%'),
});
// Returns: File

// omni-compress
import { compressImage } from 'omni-compress';

const { blob, ratio, compressedSize } = await compressImage(file, {
  format: 'webp',
  quality: 0.8,
  maxWidth: 1920,
  onProgress: (p) => console.log(p + '%'),
});
// Returns: CompressResult — blob + size metadata
console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
```

## API mapping

| browser-image-compression         | omni-compress                                                   |
| --------------------------------- | --------------------------------------------------------------- |
| `imageCompression(file, options)` | `compressImage(file, options)`                                  |
| `options.maxWidthOrHeight`        | `options.maxWidth` + `options.maxHeight`                        |
| `options.initialQuality` (0–1)    | `options.quality` (0–1)                                         |
| `options.fileType`                | `options.format` (`'webp'`, `'avif'`, `'jpeg'`, `'png'`)        |
| `options.useWebWorker`            | automatic (always workers for large files)                      |
| `options.signal`                  | `options.signal`                                                |
| `options.onProgress`              | `options.onProgress`                                            |
| Returns `File`                    | Returns `{ blob, originalSize, compressedSize, ratio, format }` |

## Full example

### React

```tsx
import { compressImage } from 'omni-compress';
import { useState } from 'react';

export function ImageUploader() {
  const [status, setStatus] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Compressing...');
    const { blob, ratio } = await compressImage(file, {
      format: 'webp',
      quality: 0.8,
      maxWidth: 1920,
      onProgress: (p) => setStatus(`${p}%`),
    });

    const formData = new FormData();
    formData.append('file', blob, file.name.replace(/\.[^.]+$/, '.webp'));
    await fetch('/api/upload', { method: 'POST', body: formData });

    setStatus(`Done — saved ${Math.round((1 - ratio) * 100)}%`);
  }

  return <input type="file" accept="image/*" onChange={handleFile} />;
}
```

### Next.js (App Router)

```tsx
// app/upload/page.tsx — client component
'use client';
import { compressImage } from 'omni-compress';

export default function UploadPage() {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) return;

    const { blob } = await compressImage(file, { format: 'webp', quality: 0.8 });

    const formData = new FormData();
    formData.append('file', blob, 'image.webp');
    await fetch('/api/upload', { method: 'POST', body: formData });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="file" type="file" accept="image/*" />
      <button type="submit">Upload</button>
    </form>
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { compressImage } from 'omni-compress';
import { ref } from 'vue';

const status = ref('');

async function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const { blob, ratio } = await compressImage(file, {
    format: 'webp',
    quality: 0.8,
    onProgress: (p) => (status.value = `${p}%`),
  });

  const formData = new FormData();
  formData.append('file', blob, 'image.webp');
  await fetch('/api/upload', { method: 'POST', body: formData });
  status.value = `Saved ${Math.round((1 - ratio) * 100)}%`;
}
</script>

<template>
  <input type="file" accept="image/*" @change="handleFile" />
  <p>{{ status }}</p>
</template>
```

## With AbortSignal (cancellation)

```ts
import { compressImage } from 'omni-compress';

const controller = new AbortController();

// Cancel button
cancelBtn.onclick = () => controller.abort();

try {
  const { blob } = await compressImage(file, {
    format: 'webp',
    quality: 0.8,
    signal: controller.signal,
  });
} catch (err) {
  if (err.name === 'AbortError') console.log('Cancelled');
}
```

## AVIF — the upgrade you can't get elsewhere

```ts
// browser-image-compression: no AVIF support
// omni-compress: AVIF via standalone libaom-av1 Wasm — no extra install needed
const { blob, ratio } = await compressImage(file, {
  format: 'avif',
  quality: 0.7,
});
// Typically 40-54% smaller than JPEG at the same visual quality
```

## Honest gaps

- **`maxSizeMB` (iterative size targeting):** `browser-image-compression` supports compressing until the file is under a target size in MB. `omni-compress` does not yet implement this ([#39](https://github.com/dharanish-v/omni-compress/issues/39)). Workaround: set `quality` explicitly.
- **`alwaysKeepResolution`:** `browser-image-compression` has this option. `omni-compress` does not resize unless you set `maxWidth`/`maxHeight`, so resolution is always preserved by default.
- **Returns `Blob` not `File`:** `browser-image-compression` returns a `File` with the original filename. `omni-compress` returns a `Blob`. Wrap it yourself: `new File([blob], 'output.webp', { type: blob.type })`.

## Step-by-step migration

1. `npm uninstall browser-image-compression`
2. `npm install omni-compress`
3. Replace `import imageCompression from 'browser-image-compression'` with `import { compressImage } from 'omni-compress'`
4. Replace `imageCompression(file, opts)` with `compressImage(file, { format: 'webp', quality: opts.initialQuality ?? 0.8, maxWidth: opts.maxWidthOrHeight, maxHeight: opts.maxWidthOrHeight })`
5. Update any code reading `.name`, `.size`, `.type` from the returned value — switch to `result.blob.size`, `result.compressedSize`, `result.ratio`

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
