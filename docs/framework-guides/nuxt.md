# omni-compress + Nuxt 3

## Install

```bash
npm install omni-compress
```

## `useCompress` composable

**`composables/useCompress.ts`**

```ts
import { ref } from 'vue';
import { compressImage, compressAudio } from 'omni-compress';
import type { CompressResult } from 'omni-compress';

export function useCompress() {
  const result = ref<CompressResult | null>(null);
  const progress = ref(0);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  let abortController: AbortController | null = null;

  async function compress(file: File, options: Parameters<typeof compressImage>[1] = {}) {
    loading.value = true;
    error.value = null;
    progress.value = 0;
    abortController = new AbortController();

    try {
      const fn = file.type.startsWith('audio/') ? compressAudio : compressImage;
      result.value = await fn(file, {
        format: 'webp',
        quality: 0.8,
        strict: true,
        ...options,
        signal: abortController.signal,
        onProgress: (p) => {
          progress.value = p;
        },
      } as any);
    } catch (e: any) {
      if (e.name !== 'AbortError') error.value = e;
    } finally {
      loading.value = false;
    }
  }

  function cancel() {
    abortController?.abort();
  }

  return { result, progress, loading, error, compress, cancel };
}
```

## Usage in a component

**`pages/upload.vue`**

```vue
<script setup lang="ts">
const { result, progress, loading, error, compress, cancel } = useCompress();

async function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  await compress(file, { format: 'webp', quality: 0.8, maxWidth: 1920 });

  if (result.value) {
    const formData = new FormData();
    formData.append('file', result.value.blob, file.name.replace(/\.\w+$/, '.webp'));
    await $fetch('/api/upload', { method: 'POST', body: formData });
  }
}
</script>

<template>
  <div>
    <input type="file" accept="image/*,audio/*" :disabled="loading" @change="handleFile" />

    <div v-if="loading">
      <progress :value="progress" max="100" />
      <button @click="cancel">Cancel</button>
    </div>

    <div v-if="result">
      <p>Format: {{ result.format }}</p>
      <p>Saved: {{ ((1 - result.ratio) * 100).toFixed(1) }}%</p>
      <img v-if="result.blob.type.startsWith('image/')" :src="URL.createObjectURL(result.blob)" />
    </div>

    <p v-if="error" class="text-red-500">{{ error.message }}</p>
  </div>
</template>
```

**`server/api/upload.post.ts`** — Nitro API route

```ts
import { writeFile } from 'fs/promises';
import { join } from 'path';

export default defineEventHandler(async (event) => {
  const form = await readFormData(event);
  const file = form.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join('public/uploads', file.name), buffer);
  return { ok: true, path: `/uploads/${file.name}` };
});
```

## Notes

- `omni-compress` is a browser-only library. Nuxt auto-detects the environment — importing it in `server/` routes will fail. Use `import.meta.client` guards if you import it in a shared file.
- Nuxt's auto-import does **not** cover `omni-compress` exports. Always import explicitly in composables and components.
- For HEIC/video support the browser needs Cross-Origin Isolation. Add `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response headers via Nitro's `routeRules` in `nuxt.config.ts`.
