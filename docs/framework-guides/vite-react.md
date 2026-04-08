# omni-compress + Vite + React

## Install

```bash
npm install omni-compress
```

## `useCompress` hook

**`src/hooks/useCompress.ts`**

```ts
import { useCallback, useRef, useState } from 'react';
import { compressImage, compressAudio, compressVideo } from 'omni-compress';
import type { CompressResult } from 'omni-compress';

type CompressOptions = {
  format?: string;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  strict?: boolean;
};

export function useCompress(defaults: CompressOptions = {}) {
  const [results, setResults] = useState<CompressResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const compressFiles = useCallback(
    async (files: File[], overrides: CompressOptions = {}) => {
      setLoading(true);
      setError(null);
      setResults([]);
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const options = { ...defaults, ...overrides };
      const out: CompressResult[] = [];

      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) break;
        const file = files[i];

        // Per-file progress mapped into the overall 0-100 range
        const basePercent = (i / files.length) * 100;
        const sliceSize = 100 / files.length;

        try {
          let result: CompressResult;
          if (file.type.startsWith('video/')) {
            result = await compressVideo(file, {
              format: (options.format as any) ?? 'mp4',
              maxWidth: options.maxWidth,
              signal,
              onProgress: (p) => setProgress(basePercent + (p / 100) * sliceSize),
            });
          } else if (file.type.startsWith('audio/')) {
            result = await compressAudio(file, {
              format: (options.format as any) ?? 'opus',
              signal,
              onProgress: (p) => setProgress(basePercent + (p / 100) * sliceSize),
            });
          } else {
            result = await compressImage(file, {
              format: (options.format as any) ?? 'webp',
              quality: options.quality ?? 0.8,
              maxWidth: options.maxWidth,
              maxHeight: options.maxHeight,
              strict: options.strict ?? true,
              signal,
              onProgress: (p) => setProgress(basePercent + (p / 100) * sliceSize),
            });
          }
          out.push(result);
        } catch (e: any) {
          if (e.name === 'AbortError') break;
          setError(e);
          break;
        }
      }

      setResults(out);
      setProgress(100);
      setLoading(false);
      return out;
    },
    [defaults],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { results, progress, loading, error, compressFiles, cancel };
}
```

## Batch file compression with drag-and-drop

**`src/App.tsx`**

```tsx
import { useRef } from 'react';
import { useCompress } from './hooks/useCompress';

export default function App() {
  const { results, progress, loading, error, compressFiles, cancel } = useCompress({
    format: 'webp',
    quality: 0.8,
    maxWidth: 1920,
    strict: true,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    compressFiles(files);
  }

  function handleDownload(result: (typeof results)[number], index: number) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(result.blob);
    a.download = `compressed-${index + 1}.${result.format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{ border: '2px dashed #ccc', padding: 40, textAlign: 'center' }}
      >
        Drop files here or <button onClick={() => inputRef.current?.click()}>browse</button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,audio/*,video/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && compressFiles(Array.from(e.target.files))}
        />
      </div>

      {loading && (
        <>
          <progress value={progress} max={100} />
          <button onClick={cancel}>Cancel</button>
        </>
      )}

      {error && <p style={{ color: 'red' }}>{error.message}</p>}

      <ul>
        {results.map((r, i) => (
          <li key={i}>
            {r.format.toUpperCase()} · {(r.compressedSize / 1024).toFixed(1)} KB · saved{' '}
            {((1 - r.ratio) * 100).toFixed(1)}%
            <button onClick={() => handleDownload(r, i)}>Download</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Notes

- Vite pre-bundles dependencies by default. Add `@jsquash/avif` to `optimizeDeps.exclude` in `vite.config.ts` to prevent Wasm fetch failures when encoding AVIF.
- For HEIC input or video compression, the dev server needs COOP/COEP headers. In `vite.config.ts` add a `configureServer` plugin (not `server.headers`) to avoid the dep-optimisation reload loop.
- `strict: true` ensures the original file is returned when compression would make it larger — useful for already-optimised PNGs.
