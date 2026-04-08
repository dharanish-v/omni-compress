# astro-omni-compress

Astro image service powered by [omni-compress](https://www.npmjs.com/package/omni-compress).

A drop-in alternative to `sharp` for Astro's `<Image>` component that works wherever sharp's native binaries fail — Docker alpine images, serverless functions, Vercel Edge, Cloudflare Workers.

## Install

```bash
npm install astro-omni-compress omni-compress
```

## Usage

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { omniCompressService } from 'astro-omni-compress';

export default defineConfig({
  image: {
    service: omniCompressService({
      format: 'webp', // default output format
      quality: 0.8, // default quality (0–1)
    }),
  },
});
```

Then use Astro's `<Image>` component as normal:

```astro
---
import { Image } from 'astro:assets';
import hero from '../assets/hero.png';
---

<!-- Automatically compressed to WebP -->
<Image src={hero} alt="Hero" width={1200} height={630} />

<!-- Override format per-image -->
<Image src={hero} alt="Hero" format="avif" quality={85} />
```

## Options

```ts
omniCompressService({
  format: 'webp', // 'webp' | 'jpeg' | 'png' | 'avif' (default: 'webp')
  quality: 0.8, // 0–1 (default: 0.8)
});
```

## Why use this instead of sharp?

|                           | sharp                | astro-omni-compress             |
| ------------------------- | -------------------- | ------------------------------- |
| Browser/edge environments | ❌ native C bindings | ✅ pure Wasm / Node             |
| Docker alpine             | ❌ binary mismatch   | ✅ works                        |
| Vercel Edge / Cloudflare  | ❌                   | ✅                              |
| AVIF output               | ✅ (with plugin)     | ✅ built-in                     |
| Audio processing          | ❌                   | ✅ (via omni-compress directly) |

## Notes

- Requires `ffmpeg` on PATH or `ffmpeg-static` installed for Node.js environments.
- AVIF uses `@jsquash/avif` (standalone libaom-av1 Wasm, 1.1 MB gzipped) — no SharedArrayBuffer required.
- For SSR builds, images are transformed at request time. For static builds, images are transformed at build time.

## License

MIT
