# omni-compress + Remix

## Install

```bash
npm install omni-compress
```

## Client-side compress then submit via `useFetcher`

**`app/routes/upload.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import { compressImage } from 'omni-compress';
import type { ActionFunctionArgs } from '@remix-run/node';
import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from '@remix-run/node';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// --- Server action ---
export async function action({ request }: ActionFunctionArgs) {
  const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 10 * 1024 * 1024 });
  const formData = await unstable_parseMultipartFormData(request, uploadHandler);

  const file = formData.get('image') as File;
  if (!file) return { error: 'No file' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}.webp`;
  await writeFile(join(process.cwd(), 'public/uploads', filename), buffer);

  return { ok: true, path: `/uploads/${filename}` };
}

// --- Client component ---
export default function UploadRoute() {
  const fetcher = useFetcher<typeof action>();
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [compressing, setCompressing] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('image') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setCompressing(true);
    abortRef.current = new AbortController();

    let compressed: Blob;
    try {
      const result = await compressImage(file, {
        format: 'webp',
        quality: 0.8,
        maxWidth: 1920,
        strict: true,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });
      compressed = result.blob;
    } catch (err: any) {
      if (err.name === 'AbortError') setProgress(0);
      setCompressing(false);
      return;
    }

    setCompressing(false);

    const formData = new FormData();
    formData.append('image', compressed, file.name.replace(/\.\w+$/, '.webp'));
    fetcher.submit(formData, { method: 'POST', encType: 'multipart/form-data' });
  }

  const busy = compressing || fetcher.state !== 'idle';

  return (
    <fetcher.Form onSubmit={handleSubmit} encType="multipart/form-data">
      <input type="file" name="image" accept="image/*" disabled={busy} />

      {compressing && (
        <>
          <progress value={progress} max={100} />
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </>
      )}

      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : 'Upload'}
      </button>

      {fetcher.data?.ok && (
        <p>
          Uploaded: <a href={fetcher.data.path}>{fetcher.data.path}</a>
        </p>
      )}
      {fetcher.data?.error && <p style={{ color: 'red' }}>{fetcher.data.error}</p>}
    </fetcher.Form>
  );
}
```

## Notes

- Compression happens in the browser before the form data ever leaves the client — your server receives an already-compressed WebP, not the original.
- The action runs in Node.js where `omni-compress` also works natively (uses ffmpeg binary). If you want to re-compress on the server side, import and call `compressImage` directly inside the action.
- `useFetcher` keeps the UI reactive without a full page navigation. If you prefer a full-page form flow, replace `useFetcher` with a regular `<Form>` and intercept `submit` the same way.

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
