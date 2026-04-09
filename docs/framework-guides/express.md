# omni-compress + Express / Node.js

## Install

```bash
npm install omni-compress
# ffmpeg must be available on PATH, or install ffmpeg-static:
npm install ffmpeg-static
```

## Compress uploaded image before saving

```ts
// server.ts
import express from 'express';
import multer from 'multer';
import { compressImage } from 'omni-compress';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const file = new Blob([req.file.buffer], { type: req.file.mimetype });

  const { blob, ratio, compressedSize } = await compressImage(file as File, {
    format: 'webp',
    quality: 0.85,
    maxWidth: 2048,
    strict: true,
  });

  const filename = `${randomUUID()}.webp`;
  const outputPath = path.join('./uploads', filename);
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));

  res.json({
    filename,
    originalSize: req.file.size,
    compressedSize,
    savedPercent: Math.round((1 - ratio) * 100),
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
```

## Batch compress a directory of images

```ts
import { compressImage } from 'omni-compress';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function batchCompress(inputDir: string, outputDir: string) {
  const files = await readdir(inputDir);
  const imageFiles = files.filter((f) => /\.(png|jpe?g|gif|tiff?)$/i.test(f));

  for (const filename of imageFiles) {
    const buffer = await readFile(path.join(inputDir, filename));
    const file = new Blob([buffer]) as File;

    const { blob, ratio, format } = await compressImage(file, {
      format: 'webp',
      quality: 0.8,
      strict: true,
    });

    const outFilename = filename.replace(/\.[^.]+$/, `.${format}`);
    await writeFile(path.join(outputDir, outFilename), Buffer.from(await blob.arrayBuffer()));
    console.log(`${filename} → ${outFilename} (-${Math.round((1 - ratio) * 100)}%)`);
  }
}

await batchCompress('./images/input', './images/output');
```

## Compress audio uploads

```ts
import { compressAudio } from 'omni-compress';

app.post('/upload-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const file = new Blob([req.file.buffer], { type: req.file.mimetype }) as File;

  const { blob, ratio } = await compressAudio(file, {
    format: 'opus',
    bitrate: '96k',
  });

  const filename = `${randomUUID()}.ogg`;
  await writeFile(path.join('./uploads', filename), Buffer.from(await blob.arrayBuffer()));

  res.json({ filename, savedPercent: Math.round((1 - ratio) * 100) });
});
```

## Notes

- omni-compress on Node.js uses the native `ffmpeg` binary via `child_process` — no Wasm, no size limit beyond disk space.
- Install `ffmpeg-static` as a fallback if `ffmpeg` isn't on PATH: `npm install ffmpeg-static`. omni-compress detects it automatically.
- `multer.memoryStorage()` holds the file in RAM — switch to `multer.diskStorage()` for very large files (>100 MB) to avoid OOM.
- `strict: true` returns the original if the compressed output is larger — safe for already-optimised images.

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
