# Migrate from compressorjs to omni-compress

`compressorjs` (296K downloads/week) uses the HTML5 Canvas API for browser image compression. This guide shows two migration paths: a **drop-in shim** (zero code changes) and the **modern Promise API**.

## Why switch?

|                 | compressorjs                 | omni-compress                |
| --------------- | ---------------------------- | ---------------------------- |
| API style       | Callback-based constructor   | `async`/`await` Promises     |
| Web Workers     | ❌ main thread only          | ✅ automatic for large files |
| AVIF            | ❌                           | ✅ libaom-av1 Wasm           |
| Audio           | ❌                           | ✅ Opus, MP3, FLAC, AAC      |
| Video           | ❌                           | ✅ MP4, WebM                 |
| Node.js         | ❌                           | ✅ native ffmpeg             |
| AbortSignal     | ❌                           | ✅                           |
| FFmpeg fallback | ❌                           | ✅ automatic                 |
| Maintained      | ❌ last release 3+ years ago | ✅ active                    |

## Option 1: Drop-in compatibility shim (zero code changes)

`omni-compress` ships a `compressorjs`-compatible API at the `/compat` subpath.

```ts
// Before
import Compressor from 'compressorjs';

// After — identical API, no other changes needed
import Compressor from 'omni-compress/compat';

new Compressor(file, {
  quality: 0.8,
  success(result) {
    uploadFile(result);
  },
  error(err) {
    console.error(err.message);
  },
});
```

The compat shim accepts all `compressorjs` options and fires the same `success`/`error` callbacks. You gain Web Workers, AVIF, and an active maintenance track with no code changes.

## Option 2: Modern Promise API (recommended)

```ts
// Before
import Compressor from 'compressorjs';

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality: 0.8,
      mimeType: 'image/webp',
      maxWidth: 1920,
      success: resolve,
      error: reject,
    });
  });
}

const blob = await compress(file);

// After
import { compressImage } from 'omni-compress';

const { blob, ratio } = await compressImage(file, {
  format: 'webp',
  quality: 0.8,
  maxWidth: 1920,
});

console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
```

## API mapping

| compressorjs                              | omni-compress                               |
| ----------------------------------------- | ------------------------------------------- |
| `new Compressor(file, opts)`              | `await compressImage(file, opts)`           |
| `opts.quality` (0–1)                      | `opts.quality` (0–1)                        |
| `opts.mimeType` (`'image/webp'`)          | `opts.format` (`'webp'`)                    |
| `opts.maxWidth`                           | `opts.maxWidth`                             |
| `opts.maxHeight`                          | `opts.maxHeight`                            |
| `opts.success(result)`                    | `const { blob } = await compressImage(...)` |
| `opts.error(err)`                         | `try/catch`                                 |
| `opts.strict` (return original if larger) | `opts.strict`                               |
| `opts.checkOrientation`                   | auto-handled by FFmpeg                      |

## React example

```tsx
import { compressImage } from 'omni-compress';

export function ImageUploader() {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const { blob, ratio } = await compressImage(file, {
      format: 'webp',
      quality: 0.8,
      strict: true, // return original if compressed is larger
    });

    const formData = new FormData();
    formData.append('image', blob, 'photo.webp');
    await fetch('/api/upload', { method: 'POST', body: formData });
    console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
  }

  return <input type="file" accept="image/*" onChange={handleFile} />;
}
```

## Strict mode (return original if compressed is larger)

Both libraries support this. The behaviour is identical:

```ts
// compressorjs
new Compressor(file, { strict: true, success(result) { ... } });

// omni-compress
const { blob } = await compressImage(file, { format: 'webp', quality: 0.8, strict: true });
// blob === original File if compressed would be larger
```

## AVIF — new output format

compressorjs is limited to what `canvas.toBlob()` supports (JPEG, PNG, WebP). `omni-compress` adds AVIF via a standalone libaom-av1 Wasm encoder — typically 40-54% smaller than JPEG:

```ts
const { blob, ratio } = await compressImage(file, {
  format: 'avif',
  quality: 0.7,
});
```

## Honest gaps

- **`convertSize`:** compressorjs converts images over a size threshold to JPEG. `omni-compress` does not auto-convert based on file size — set `format` explicitly.
- **`beforeDraw` / `drew` canvas hooks:** compressorjs exposes canvas hooks for custom drawing. `omni-compress` has no equivalent — it processes the full image.
- **`checkOrientation`:** compressorjs manually corrects EXIF orientation. omni-compress delegates orientation handling to FFmpeg, which handles it correctly.

## Step-by-step migration

1. `npm uninstall compressorjs`
2. `npm install omni-compress`
3. **Quick path:** Replace `import Compressor from 'compressorjs'` with `import Compressor from 'omni-compress/compat'`
4. **Modern path:** Wrap callback usage in `async/await` using the table above

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
