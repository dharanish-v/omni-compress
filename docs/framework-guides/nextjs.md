# omni-compress + Next.js (App Router)

## Install

```bash
npm install omni-compress
```

## Compress image before presigned S3 upload

**`app/upload/page.tsx`** — client component

```tsx
'use client';

import { useState } from 'react';
import { compressImage } from 'omni-compress';

export default function UploadPage() {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Compressing...');

    const { blob, ratio, compressedSize } = await compressImage(file, {
      format: 'webp',
      quality: 0.8,
      maxWidth: 1920,
      strict: true,
      onProgress: setProgress,
    });

    setStatus(`Compressed ${(ratio * 100).toFixed(1)}% smaller. Uploading...`);

    // Get a presigned URL from your API route
    const res = await fetch('/api/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: 'image/webp',
        size: compressedSize,
      }),
    });
    const { url, key } = await res.json();

    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      body: blob,
    });

    setStatus(`Done! Stored at ${key}`);
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {progress > 0 && progress < 100 && <progress value={progress} max={100} />}
      <p>{status}</p>
    </div>
  );
}
```

**`app/api/presign/route.ts`** — API route that issues the presigned URL

```ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION! });

export async function POST(req: NextRequest) {
  const { filename, contentType } = await req.json();
  const ext = filename.split('.').pop();
  const key = `uploads/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 60 });
  return NextResponse.json({ url, key });
}
```

## With progress + cancellation

```tsx
'use client';

import { useRef, useState } from 'react';
import { compressImage } from 'omni-compress';

export default function UploadWithCancel() {
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);

  async function handleUpload(file: File) {
    abortRef.current = new AbortController();

    try {
      const { blob } = await compressImage(file, {
        format: 'webp',
        quality: 0.8,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });
      // ... upload blob
    } catch (err: any) {
      if (err.name === 'AbortError') setProgress(0);
    }
  }

  return (
    <>
      <input type="file" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
      <button onClick={() => abortRef.current?.abort()}>Cancel</button>
      <progress value={progress} max={100} />
    </>
  );
}
```

## Notes

- `omni-compress` is a client-only library. Keep it inside `'use client'` components — never import it in Server Components or API routes.
- For HEIC/AVIF input or video compression, the browser needs Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). Add them in `next.config.ts` under `headers()`.
- `strict: true` returns the original file if compression makes it larger — safe default for already-optimised PNGs or tiny files.

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
