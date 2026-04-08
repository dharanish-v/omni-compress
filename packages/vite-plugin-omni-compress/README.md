# vite-plugin-omni-compress

Compress image and audio assets at build time using [omni-compress](https://www.npmjs.com/package/omni-compress).

Vite has no built-in image/audio optimization — this plugin fills that gap.

## Install

```bash
npm install --save-dev vite-plugin-omni-compress omni-compress
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { omniCompress } from 'vite-plugin-omni-compress';

export default defineConfig({
  plugins: [
    omniCompress({
      images: { format: 'webp', quality: 0.8 },
      audio: { format: 'opus', bitrate: '96k' },
    }),
  ],
});
```

## Options

```ts
omniCompress({
  // Image compression — set to false to disable
  images: {
    format: 'webp', // 'webp' | 'jpeg' | 'png' | 'avif' (default: 'webp')
    quality: 0.8, // 0–1 (default: 0.8)
    maxWidth: 1920, // optional
    maxHeight: 1080, // optional
    strict: true, // return original if compressed is larger (default: true)
  },

  // Audio compression — set to false to disable
  audio: {
    format: 'opus', // 'opus' | 'mp3' | 'aac' | 'flac' (default: 'opus')
    bitrate: '96k', // (default: '96k')
  },

  // Glob patterns to include (matched against filenames)
  include: ['**/*.{png,jpg,jpeg,wav,mp3}'],

  // Glob patterns to exclude
  exclude: ['**/node_modules/**'],

  // Print compression stats to terminal (default: true)
  verbose: true,
});
```

## Example output

```
[vite-plugin-omni-compress]
  assets/hero.png → assets/hero.webp — 245 KB → 38 KB (-85%) [webp]
  assets/intro.wav → assets/intro.ogg — 8.2 MB → 680 KB (-92%) [opus]
  Total: 7.7 MB saved (-91%) across 2 files
```

## Notes

- Runs in the `closeBundle` hook — after Vite finishes building, before the process exits.
- Uses the Node.js path of omni-compress (native `ffmpeg` binary). Requires `ffmpeg` on PATH or `ffmpeg-static` installed.
- Files are replaced in-place in the output directory. The original file is deleted if the extension changes (e.g. `.png` → `.webp`).
- If compression yields a larger file, the original is kept unchanged (`strict: true`).

## License

MIT
