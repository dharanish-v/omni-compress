# omni-compress + Cloudflare Workers

## Honest assessment

omni-compress has two execution paths:

| Path                                      | Requires                           | Cloudflare Workers support                                                |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| **Fast Path** — OffscreenCanvas (images)  | DOM APIs                           | ❌ Workers have no DOM                                                    |
| **Fast Path** — WebCodecs (audio)         | `AudioEncoder` / `VideoEncoder`    | ❌ Not available in Workers                                               |
| **Heavy Path** — FFmpeg Wasm              | `SharedArrayBuffer` + multi-thread | ⚠️ SAB disabled in Workers; single-thread only works if Wasm size < 25 MB |
| **Node adapter** — native `ffmpeg` binary | `child_process`                    | ❌ Not available in Workers                                               |

**Bottom line**: omni-compress's browser fast path requires browser APIs that Cloudflare Workers don't expose. The FFmpeg Wasm heavy path may work for small files but is impractical (25 MB Wasm + CPU-limited Workers runtime).

**Recommended alternative for Cloudflare Workers**: Use the [Cloudflare Images API](https://developers.cloudflare.com/images/) for image transformation at the edge — it's purpose-built for this use case.

## What actually works: image resizing via Canvas (Workers with browser-compatible runtime)

If you're using **Cloudflare Workers with the "browser rendering" or `nodejs_compat` flag**, some Canvas APIs are available:

```ts
// worker.ts — requires Cloudflare Workers with nodejs_compat + wasm flag
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get('url');
    if (!imageUrl) return new Response('Missing ?url=', { status: 400 });

    // Fetch the original image
    const res = await fetch(imageUrl);
    const buffer = await res.arrayBuffer();

    // omni-compress Node adapter is not available here.
    // Use Cloudflare's built-in image resizing instead:
    const transformed = await fetch(imageUrl, {
      cf: {
        image: {
          width: 800,
          quality: 80,
          format: 'webp',
        },
      },
    });

    return new Response(transformed.body, {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000' },
    });
  },
};
```

## Recommended: use omni-compress in a Node.js sidecar

For real compression workloads at the edge, the recommended architecture is:

```
Client → Cloudflare Worker (routing + auth)
            ↓
         Node.js service (omni-compress, native ffmpeg)
            ↓
         R2 / S3 (storage)
```

The Worker handles request routing, authentication, and CDN caching. A standard Node.js service handles actual compression:

```ts
// Node.js compression service (runs on a VM/container, not in Workers)
import express from 'express';
import { compressImage } from 'omni-compress';

const app = express();

app.post('/compress', async (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const file = new Blob([Buffer.concat(chunks)]) as File;
    const { blob, ratio } = await compressImage(file, { format: 'webp', quality: 0.8 });
    const output = Buffer.from(await blob.arrayBuffer());
    res.set('Content-Type', 'image/webp').set('X-Compression-Ratio', String(ratio)).send(output);
  });
});
```

## Notes

- Cloudflare Workers support **Wasm modules** but impose strict CPU time limits (10 ms burst on the free plan, 30s on paid). FFmpeg Wasm encoding typically takes 100ms–5s depending on file size and format — this exceeds the free plan limits.
- For build-time asset optimization (not runtime), use [`vite-plugin-omni-compress`](https://www.npmjs.com/package/vite-plugin-omni-compress) to compress your static assets before deploying to Cloudflare Pages.
- omni-compress is fully supported in **Cloudflare Pages Functions** only when used as a client-side library loaded in the browser — not in the server-side function handler.

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
