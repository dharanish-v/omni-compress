# omni-compress + Astro

## Install

```bash
npm install omni-compress
```

## Compress in a React island

`omni-compress` runs entirely in the browser. Use a React (or any framework) island with `client:load`.

**`src/components/ImageUploader.tsx`**

```tsx
import { useState } from 'react';
import { compressImage } from 'omni-compress';

export default function ImageUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  const [progress, setProgress] = useState(0);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setInfo('Compressing…');
    setProgress(0);

    const { blob, ratio, format } = await compressImage(file, {
      format: 'webp',
      quality: 0.8,
      maxWidth: 1920,
      strict: true,
      onProgress: setProgress,
    });

    setPreview(URL.createObjectURL(blob));
    setInfo(`${format.toUpperCase()} · saved ${((1 - ratio) * 100).toFixed(1)}%`);
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleChange} />
      {progress > 0 && progress < 100 && <progress value={progress} max={100} />}
      <p>{info}</p>
      {preview && <img src={preview} alt="compressed preview" style={{ maxWidth: '100%' }} />}
    </div>
  );
}
```

**`src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import ImageUploader from '../components/ImageUploader';
---

<Layout title="Compress">
  <!-- client:load hydrates immediately after the page loads -->
  <ImageUploader client:load />
</Layout>
```

## COOP/COEP headers for FFmpeg Wasm (HEIC input / video compression)

FFmpeg Wasm requires `SharedArrayBuffer`, which in turn requires Cross-Origin Isolation headers. Without them, HEIC and video will fall back to single-threaded mode (still works, just slower).

**`astro.config.mjs`**

```js
import { defineConfig } from 'astro/integration-kit'; // or just 'astro'
import { defineConfig } from 'astro';

export default defineConfig({
  vite: {
    // Required so @jsquash/avif's Wasm fetch isn't broken by pre-bundling
    optimizeDeps: {
      exclude: ['@jsquash/avif'],
    },
    // Do NOT use vite.server.headers for COOP/COEP —
    // it causes a dep-optimisation reload loop in Astro dev.
    // Use the plugin below instead.
    plugins: [
      {
        name: 'configure-response-headers',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            next();
          });
        },
      },
    ],
  },
});
```

For **production** (e.g. GitHub Pages or Netlify) use a Service Worker to inject the headers. A drop-in solution is `coi-serviceworker.js` — load it conditionally in your layout so it only runs in production:

```astro
---
// src/layouts/Layout.astro
---
{import.meta.env.PROD && (
  <script src="/coi-serviceworker.js" is:inline />
)}
```

## Notes

- Never import `omni-compress` in `.astro` frontmatter (`---` blocks) — that code runs at build time in Node.js with no browser globals. Keep all imports inside island components.
- `client:load` is the safest directive. `client:visible` also works for below-the-fold uploaders.
- Do **not** add `vite.server.headers` for COOP/COEP in `astro.config.mjs` — it triggers a Vite dep-optimisation reload loop. Use the `configure-response-headers` Vite plugin shown above.
