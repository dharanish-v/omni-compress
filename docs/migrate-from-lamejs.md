# Migrate from lamejs to omni-compress

`lamejs` (61K downloads/week) is a JavaScript MP3 encoder that requires raw PCM input and a manual chunk loop. This guide shows how to replace it with `omni-compress`'s one-liner audio API.

## Why switch?

|                 | lamejs            | omni-compress                        |
| --------------- | ----------------- | ------------------------------------ |
| MP3 encoding    | ✅                | ✅                                   |
| Opus encoding   | ❌                | ✅ (96 kbps Opus > 128 kbps MP3)     |
| FLAC            | ❌                | ✅                                   |
| AAC             | ❌                | ✅                                   |
| WAV passthrough | ❌                | ✅                                   |
| Input format    | Raw PCM only      | Any audio file (WAV, MP3, OGG, etc.) |
| Web Workers     | ❌ main thread    | ✅ automatic                         |
| API style       | Manual chunk loop | `async`/`await` one-liner            |
| License         | **LGPL** (viral)  | **MIT**                              |
| Maintained      | ❌ abandoned      | ✅ active                            |

> **License note:** lamejs is LGPL. If you distribute a web app that bundles lamejs, LGPL's requirements around dynamic linking may apply. `omni-compress` is MIT — no restrictions.

## Quick comparison

```ts
// lamejs — 15+ lines of boilerplate
import lamejs from 'lamejs';

const channels = 1;
const sampleRate = 44100;
const kbps = 128;
const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);

const left = new Int16Array(pcmBuffer);
const blockSize = 1152;
const mp3Data: Int8Array[] = [];

for (let i = 0; i < left.length; i += blockSize) {
  const chunk = left.subarray(i, i + blockSize);
  const encoded = encoder.encodeBuffer(chunk);
  if (encoded.length > 0) mp3Data.push(encoded);
}
const flushed = encoder.flush();
if (flushed.length > 0) mp3Data.push(flushed);

const blob = new Blob(mp3Data, { type: 'audio/mp3' });

// omni-compress — one line
import { compressAudio } from 'omni-compress';

const { blob } = await compressAudio(audioFile, { format: 'mp3', bitrate: '128k' });
```

## Key difference: input format

lamejs requires **raw signed 16-bit PCM** (`Int16Array`). You have to decode your audio yourself before encoding. `omni-compress` accepts any `File` or `Blob` that the browser (or FFmpeg) can decode — WAV, MP3, OGG, FLAC, M4A, etc.

```ts
// lamejs: you must decode first (e.g. via AudioContext)
const audioCtx = new AudioContext();
const decoded = await audioCtx.decodeAudioData(await file.arrayBuffer());
const pcm = new Int16Array(decoded.getChannelData(0).map((s) => s * 32767));
// ... then encode with lamejs

// omni-compress: pass the file directly
const { blob } = await compressAudio(file, { format: 'mp3', bitrate: '128k' });
```

## API mapping

| lamejs                                              | omni-compress                                             |
| --------------------------------------------------- | --------------------------------------------------------- |
| `new lamejs.Mp3Encoder(channels, sampleRate, kbps)` | `compressAudio(file, { format: 'mp3', bitrate: '128k' })` |
| Manual `encodeBuffer()` loop                        | Handled internally                                        |
| `encoder.flush()`                                   | Handled internally                                        |
| Output: `Int8Array[]` chunks                        | Output: `{ blob, ratio, compressedSize }`                 |
| Input: raw PCM `Int16Array`                         | Input: any `File` or `Blob`                               |

## Examples

### React — compress audio before upload

```tsx
import { compressAudio } from 'omni-compress';
import { useState } from 'react';

export function AudioUploader() {
  const [status, setStatus] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Compressing...');
    const { blob, ratio } = await compressAudio(file, {
      format: 'mp3',
      bitrate: '128k',
      onProgress: (p) => setStatus(`${p}%`),
    });

    const formData = new FormData();
    formData.append('audio', blob, 'audio.mp3');
    await fetch('/api/upload', { method: 'POST', body: formData });
    setStatus(`Done — saved ${Math.round((1 - ratio) * 100)}%`);
  }

  return <input type="file" accept="audio/*" onChange={handleFile} />;
}
```

### Opus — better quality than MP3

Opus at 96 kbps is perceptually superior to MP3 at 128 kbps (IETF listening tests). If you don't need MP3 specifically, use Opus:

```ts
const { blob } = await compressAudio(file, {
  format: 'opus',
  bitrate: '96k',
});
// ~25% smaller than 128k MP3, better perceived quality
```

### Node.js — batch compress audio files

```ts
import { compressAudio } from 'omni-compress';
import * as fs from 'node:fs';
import * as path from 'node:path';

const files = fs.readdirSync('./audio').filter((f) => /\.(wav|flac|ogg)$/i.test(f));

for (const filename of files) {
  const data = fs.readFileSync(path.join('./audio', filename));
  const file = new Blob([data]);

  const { blob, ratio } = await compressAudio(file, {
    format: 'mp3',
    bitrate: '128k',
  });

  const outName = filename.replace(/\.[^.]+$/, '.mp3');
  fs.writeFileSync(path.join('./audio', outName), Buffer.from(await blob.arrayBuffer()));
  console.log(`${filename} → ${outName} (saved ${Math.round((1 - ratio) * 100)}%)`);
}
```

### With cancellation

```ts
const controller = new AbortController();

cancelBtn.onclick = () => controller.abort();

try {
  const { blob } = await compressAudio(file, {
    format: 'mp3',
    bitrate: '128k',
    signal: controller.signal,
    onProgress: (p) => console.log(`${p}%`),
  });
} catch (err) {
  if (err.name === 'AbortError') console.log('Cancelled');
}
```

## Honest gaps

- **Streaming encoding:** lamejs can encode audio chunk-by-chunk as it arrives (e.g. from a microphone). `omni-compress` requires the full audio file upfront. For real-time microphone recording + streaming MP3 encoding, lamejs is still the right tool.
- **Raw PCM input:** If you already have raw PCM data (e.g. from the Web Audio API), `omni-compress` requires you to package it into a WAV file first before passing it in.

## Step-by-step migration

1. `npm uninstall lamejs`
2. `npm install omni-compress`
3. Remove all PCM decoding boilerplate
4. Replace the encoder loop with `await compressAudio(file, { format: 'mp3', bitrate: '128k' })`
5. Use `blob` directly instead of assembling `Int8Array` chunks

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
