# Migrate from jimp to omni-compress

`jimp` (2.25M downloads/week) is a JavaScript image processing library for Node.js. This guide covers replacing jimp's **compression and resize** workflow with `omni-compress`. Note that jimp does much more than compression — see the [honest gaps](#honest-gaps) section.

## Why switch for compression + resize?

|                   | jimp                     | omni-compress                |
| ----------------- | ------------------------ | ---------------------------- |
| Browser           | ⚠️ runs but very slow    | ✅ Web Workers + native APIs |
| Node.js           | ✅                       | ✅ native ffmpeg             |
| WebP output       | ✅ (v1+)                 | ✅                           |
| AVIF output       | ❌                       | ✅                           |
| Audio compression | ❌                       | ✅                           |
| Video compression | ❌                       | ✅                           |
| Web Workers       | ❌                       | ✅ automatic                 |
| Performance       | ⚠️ pure JS decode/encode | ✅ hardware-accelerated      |
| TypeScript        | ✅                       | ✅ strict                    |

## Quick comparison

```ts
// jimp — resize + compress to JPEG
import { Jimp } from 'jimp';

const image = await Jimp.read(buffer);
image.resize({ w: 1920 });
image.quality(80);
const output = await image.getBuffer('image/jpeg');

// omni-compress — resize + compress to WebP (better quality, smaller file)
import { compressImage } from 'omni-compress';
import * as fs from 'node:fs';

const file = new Blob([fs.readFileSync('input.jpg')], { type: 'image/jpeg' });
const { blob } = await compressImage(file, {
  format: 'webp',
  quality: 0.8,
  maxWidth: 1920,
});
const buffer = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync('output.webp', buffer);
```

## API mapping

| jimp                       | omni-compress                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| `Jimp.read(buffer)`        | `new Blob([buffer], { type: 'image/jpeg' })`                     |
| `.resize({ w, h })`        | `{ maxWidth: w, maxHeight: h }`                                  |
| `.quality(0-100)`          | `{ quality: 0-1 }` — divide by 100                               |
| `.getBuffer('image/jpeg')` | `compressImage(file, { format: 'jpeg' })` → `blob.arrayBuffer()` |
| `.getBuffer('image/png')`  | `compressImage(file, { format: 'png' })`                         |
| `.getBuffer('image/webp')` | `compressImage(file, { format: 'webp' })`                        |
| Output: `Buffer`           | Output: `Blob` → `Buffer.from(await blob.arrayBuffer())`         |

## Node.js examples

### Compress a single file

```ts
import { compressImage } from 'omni-compress';
import * as fs from 'node:fs';

async function compressFile(inputPath: string, outputPath: string) {
  const data = fs.readFileSync(inputPath);
  const file = new Blob([data]);

  const { blob, ratio } = await compressImage(file, {
    format: 'webp',
    quality: 0.8,
    maxWidth: 1920,
  });

  fs.writeFileSync(outputPath, Buffer.from(await blob.arrayBuffer()));
  console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
}

await compressFile('photo.jpg', 'photo.webp');
```

### Batch compress a directory

```ts
import { compressImage } from 'omni-compress';
import * as fs from 'node:fs';
import * as path from 'node:path';

const inputDir = './images/original';
const outputDir = './images/compressed';
fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(inputDir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));

for (const filename of files) {
  const data = fs.readFileSync(path.join(inputDir, filename));
  const file = new Blob([data]);

  const { blob, ratio } = await compressImage(file, {
    format: 'webp',
    quality: 0.8,
    maxWidth: 1920,
  });

  const outName = filename.replace(/\.[^.]+$/, '.webp');
  fs.writeFileSync(path.join(outputDir, outName), Buffer.from(await blob.arrayBuffer()));
  console.log(`${filename} → ${outName} (saved ${Math.round((1 - ratio) * 100)}%)`);
}
```

### Compress to AVIF (not possible with jimp)

```ts
const { blob, ratio } = await compressImage(file, {
  format: 'avif',
  quality: 0.7,
});
// Typically 40-54% smaller than JPEG at the same visual quality
```

### Express.js — compress uploaded files on the server

```ts
import express from 'express';
import multer from 'multer';
import { compressImage } from 'omni-compress';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file');

  const file = new Blob([req.file.buffer], { type: req.file.mimetype });
  const { blob, ratio } = await compressImage(file, {
    format: 'webp',
    quality: 0.8,
    maxWidth: 1920,
  });

  const output = Buffer.from(await blob.arrayBuffer());
  // Save to disk or S3...
  res.json({ size: output.length, savedPercent: Math.round((1 - ratio) * 100) });
});
```

## Honest gaps

`omni-compress` is a **compression and format conversion** library, not a full image processing toolkit. If you need any of the following jimp operations, you should keep jimp or find a dedicated library:

- **Color manipulation** — `.color()`, `.brightness()`, `.contrast()`, `.greyscale()`
- **Crop** — `.crop()`
- **Flip / rotate** — `.flip()`, `.rotate()`
- **Composite / overlay** — `.composite()`
- **Custom filters** — `.scan()`, pixel-level operations
- **Reading image metadata** — `.width`, `.height`, `.bitmap`

`omni-compress` handles: **resize + compress + format convert**. If you need the full jimp pipeline, use both libraries — run jimp for transformations, then pass the output buffer to `compressImage` for the final compress step.

## Step-by-step migration (resize + compress only)

1. `npm install omni-compress` (keep jimp if you need its other features)
2. Replace `Jimp.read(buffer)` → `new Blob([buffer], { type })`
3. Replace `.resize({ w }).quality(q).getBuffer(mime)` → `compressImage(file, { format, quality: q/100, maxWidth: w })`
4. Convert `blob` back to `Buffer`: `Buffer.from(await blob.arrayBuffer())`

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
