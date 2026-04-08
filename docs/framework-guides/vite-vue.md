# omni-compress + Vite + Vue 3

## Install

```bash
npm install omni-compress
```

## `useCompress` composable

**`src/composables/useCompress.ts`**

```ts
import { ref, computed } from 'vue';
import { compressImage, compressAudio, compressVideo } from 'omni-compress';
import type { CompressResult } from 'omni-compress';

export function useCompress() {
  const result = ref<CompressResult | null>(null);
  const progress = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let abortController: AbortController | null = null;

  const savedPercent = computed(() =>
    result.value ? ((1 - result.value.ratio) * 100).toFixed(1) : '0',
  );

  async function compress(file: File) {
    loading.value = true;
    error.value = null;
    progress.value = 0;
    result.value = null;
    abortController = new AbortController();

    try {
      if (file.type.startsWith('video/')) {
        result.value = await compressVideo(file, {
          format: 'mp4',
          maxWidth: 1920,
          signal: abortController.signal,
          onProgress: (p) => {
            progress.value = p;
          },
        });
      } else if (file.type.startsWith('audio/')) {
        result.value = await compressAudio(file, {
          format: 'opus',
          bitrate: '96k',
          signal: abortController.signal,
          onProgress: (p) => {
            progress.value = p;
          },
        });
      } else {
        result.value = await compressImage(file, {
          format: 'webp',
          quality: 0.8,
          maxWidth: 1920,
          strict: true,
          signal: abortController.signal,
          onProgress: (p) => {
            progress.value = p;
          },
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  function cancel() {
    abortController?.abort();
  }

  function downloadResult(filename: string) {
    if (!result.value) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(result.value.blob);
    a.download = filename.replace(/\.\w+$/, `.${result.value.format}`);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { result, progress, loading, error, savedPercent, compress, cancel, downloadResult };
}
```

## Usage in a component

**`src/components/FileCompressor.vue`**

```vue
<script setup lang="ts">
import { useCompress } from '../composables/useCompress';

const { result, progress, loading, error, savedPercent, compress, cancel, downloadResult } =
  useCompress();

let currentFilename = '';

function handleChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  currentFilename = file.name;
  compress(file);
}
</script>

<template>
  <div class="compressor">
    <label>
      Select file
      <input
        type="file"
        accept="image/*,audio/*,video/*"
        :disabled="loading"
        @change="handleChange"
      />
    </label>

    <template v-if="loading">
      <progress :value="progress" max="100" />
      <span>{{ progress.toFixed(0) }}%</span>
      <button @click="cancel">Cancel</button>
    </template>

    <div v-if="result" class="result">
      <p>
        Format: <strong>{{ result.format.toUpperCase() }}</strong>
      </p>
      <p>Original: {{ (result.originalSize / 1024).toFixed(1) }} KB</p>
      <p>Compressed: {{ (result.compressedSize / 1024).toFixed(1) }} KB</p>
      <p>
        Saved: <strong>{{ savedPercent }}%</strong>
      </p>

      <img
        v-if="result.blob.type.startsWith('image/')"
        :src="URL.createObjectURL(result.blob)"
        alt="preview"
        style="max-width: 100%"
      />

      <button @click="downloadResult(currentFilename)">Download</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
```

## Notes

- Vite pre-bundles dependencies; add `@jsquash/avif` to `optimizeDeps.exclude` in `vite.config.ts` to prevent Wasm fetch failures when encoding AVIF.
- `URL.createObjectURL` in the template is safe because it is evaluated at render time (client-side). The blob URL leaks until the component unmounts — call `URL.revokeObjectURL` in `onUnmounted` for long-lived components.
- For video/HEIC support in development, add a `configureServer` Vite plugin to inject COOP/COEP headers; do not use `server.headers` directly to avoid the dep-optimisation reload loop.
