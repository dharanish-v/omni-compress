# Migrate from @ffmpeg/ffmpeg to omni-compress

`@ffmpeg/ffmpeg` (377K downloads/week) is a low-level FFmpeg WebAssembly wrapper. `omni-compress` uses it internally but wraps it in a production-ready lifecycle management layer — concurrency queue, size guard, singleton with idle timeout, VFS cleanup, and a unified API for images, audio, and video.

## Why switch?

|                     | @ffmpeg/ffmpeg (raw)      | omni-compress                                       |
| ------------------- | ------------------------- | --------------------------------------------------- |
| API                 | Low-level VFS commands    | `async`/`await` one-liner                           |
| Memory management   | Manual VFS cleanup        | Automatic                                           |
| Concurrency         | Manual                    | Queue (prevents VFS collisions)                     |
| Singleton lifecycle | Manual                    | 30s idle auto-terminate                             |
| Size guard          | None                      | 250 MB limit + `FileTooLargeError`                  |
| Images              | Manual `-i input -vcodec` | `compressImage()`                                   |
| Audio               | Manual `-i input -acodec` | `compressAudio()`                                   |
| Video               | Manual `-i input -vcodec` | `compressVideo()`                                   |
| Node.js             | ❌ Wasm only              | ✅ native ffmpeg binary                             |
| Multi-threading     | Manual `core-mt` setup    | Automatic (when SAB available)                      |
| AbortSignal         | ❌                        | ✅                                                  |
| Progress            | Manual stderr parsing     | `onProgress` callback                               |
| Fast Path bypass    | Never                     | Automatic (avoids Wasm entirely for common formats) |

## Quick comparison

```ts
// @ffmpeg/ffmpeg — 10+ lines of boilerplate per operation
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();
await ffmpeg.load();
await ffmpeg.writeFile('input.wav', await fetchFile(file));
await ffmpeg.exec(['-i', 'input.wav', '-c:a', 'libopus', '-b:a', '96k', 'output.opus']);
const output = await ffmpeg.readFile('output.opus');
await ffmpeg.deleteFile('input.wav');
await ffmpeg.deleteFile('output.opus');
const blob = new Blob([output], { type: 'audio/ogg' });

// omni-compress — one line
import { compressAudio } from 'omni-compress';

const { blob } = await compressAudio(file, { format: 'opus', bitrate: '96k' });
```

## API mapping

| @ffmpeg/ffmpeg pattern                                                          | omni-compress                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ffmpeg.load()` + `writeFile()` + `exec(['-vcodec', 'libwebp'])` + `readFile()` | `compressImage(file, { format: 'webp' })`                 |
| `exec(['-c:a', 'libmp3lame', '-b:a', '128k'])`                                  | `compressAudio(file, { format: 'mp3', bitrate: '128k' })` |
| `exec(['-c:a', 'libopus', '-b:a', '96k'])`                                      | `compressAudio(file, { format: 'opus', bitrate: '96k' })` |
| `exec(['-c:a', 'flac'])`                                                        | `compressAudio(file, { format: 'flac' })`                 |
| `exec(['-c:a', 'aac', '-b:a', '128k'])`                                         | `compressAudio(file, { format: 'aac', bitrate: '128k' })` |
| `exec(['-vcodec', 'libx264', '-b:v', '1M'])`                                    | `compressVideo(file, { format: 'mp4', bitrate: '1M' })`   |
| `exec(['-vf', 'scale=1920:-1'])`                                                | `compressImage(file, { maxWidth: 1920 })`                 |
| `exec(['-q:v', '80'])`                                                          | `compressImage(file, { quality: 0.8 })`                   |
| Manual stderr parse for progress                                                | `onProgress: (p) => ...`                                  |
| `ffmpeg.terminate()`                                                            | Automatic (30s idle timeout)                              |
| Manual VFS cleanup                                                              | Automatic                                                 |

## Examples

### Image compression

```ts
// Before — 10 lines
const ffmpeg = new FFmpeg();
await ffmpeg.load();
await ffmpeg.writeFile('input.png', await fetchFile(file));
await ffmpeg.exec(['-i', 'input.png', '-vcodec', 'libwebp', '-q:v', '80', 'output.webp']);
const data = await ffmpeg.readFile('output.webp');
await ffmpeg.deleteFile('input.png');
await ffmpeg.deleteFile('output.webp');
const blob = new Blob([data], { type: 'image/webp' });

// After — 1 line
const { blob, ratio } = await compressImage(file, { format: 'webp', quality: 0.8 });
console.log(`Saved ${Math.round((1 - ratio) * 100)}%`);
```

### Audio compression

```ts
// Before
const ffmpeg = new FFmpeg();
await ffmpeg.load();
await ffmpeg.writeFile('input.wav', await fetchFile(file));
await ffmpeg.exec(['-i', 'input.wav', '-c:a', 'libopus', '-b:a', '96k', 'output.opus']);
const data = await ffmpeg.readFile('output.opus');
await ffmpeg.deleteFile('input.wav');
await ffmpeg.deleteFile('output.opus');
const blob = new Blob([data], { type: 'audio/ogg' });

// After
const { blob } = await compressAudio(file, { format: 'opus', bitrate: '96k' });
```

### With progress + cancellation

```ts
import { compressVideo } from 'omni-compress';

const controller = new AbortController();
cancelBtn.onclick = () => controller.abort();

try {
  const { blob, ratio } = await compressVideo(file, {
    format: 'mp4',
    bitrate: '1M',
    onProgress: (p) => (progressBar.style.width = `${p}%`),
    signal: controller.signal,
  });
} catch (err) {
  if (err.name === 'AbortError') console.log('Cancelled');
}
```

### React hook

```ts
import { compressAudio, compressImage } from 'omni-compress';
import { useState, useRef } from 'react';

export function useCompress() {
  const [progress, setProgress] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  async function compress(file: File, type: 'image' | 'audio') {
    controllerRef.current = new AbortController();
    setProgress(0);

    const opts = {
      format: type === 'image' ? 'webp' : 'opus',
      quality: 0.8,
      signal: controllerRef.current.signal,
      onProgress: setProgress,
    } as const;

    return type === 'image' ? compressImage(file, opts) : compressAudio(file, opts as any);
  }

  function cancel() {
    controllerRef.current?.abort();
  }

  return { compress, cancel, progress };
}
```

### Node.js — bypass Wasm entirely

On Node.js, `omni-compress` uses the native `ffmpeg` binary via `child_process` — no Wasm, no size limit:

```ts
// @ffmpeg/ffmpeg doesn't run on Node.js at all
// omni-compress works identically in Node
import { compressAudio } from 'omni-compress';
import * as fs from 'node:fs';

const file = new Blob([fs.readFileSync('input.wav')]);
const { blob } = await compressAudio(file, { format: 'opus', bitrate: '96k' });
fs.writeFileSync('output.opus', Buffer.from(await blob.arrayBuffer()));
```

## What omni-compress doesn't expose

omni-compress covers the most common compression operations. If you need to run arbitrary FFmpeg commands (filters, subtitle manipulation, muxing multiple streams, etc.), continue using `@ffmpeg/ffmpeg` directly. The two can coexist in the same project.

## Step-by-step migration

1. `npm install omni-compress` (keep `@ffmpeg/ffmpeg` if you need raw access)
2. Replace `FFmpeg.load()` + `writeFile()` + `exec()` + `readFile()` + `deleteFile()` with one `compressImage()`, `compressAudio()`, or `compressVideo()` call
3. Replace manual stderr progress parsing with `onProgress` callback
4. Remove manual `ffmpeg.terminate()` calls — the singleton self-terminates after 30s idle
