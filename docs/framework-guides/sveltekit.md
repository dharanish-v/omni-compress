# omni-compress + SvelteKit

## Install

```bash
npm install omni-compress
```

## Compress in `+page.svelte` before submitting to a server action

**`src/routes/upload/+page.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { compressImage } from 'omni-compress';

  let progress = $state(0);
  let compressing = $state(false);
  let info = $state('');
  let preview = $state('');
  let abortController: AbortController | null = null;

  let formEl: HTMLFormElement;
  let inputEl: HTMLInputElement;

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    compressing = true;
    progress = 0;
    info = '';
    abortController = new AbortController();

    try {
      const result = await compressImage(file, {
        format: 'webp',
        quality: 0.8,
        maxWidth: 1920,
        strict: true,
        signal: abortController.signal,
        onProgress: (p) => { progress = p; },
      });

      // Replace the file input's file with the compressed blob
      const compressed = new File([result.blob], file.name.replace(/\.\w+$/, '.webp'), {
        type: 'image/webp',
      });
      const dt = new DataTransfer();
      dt.items.add(compressed);
      inputEl.files = dt.files;

      preview = URL.createObjectURL(result.blob);
      info = `${result.format.toUpperCase()} · saved ${((1 - result.ratio) * 100).toFixed(1)}%`;
    } catch (err: any) {
      if (err.name !== 'AbortError') info = `Error: ${err.message}`;
    } finally {
      compressing = false;
    }
  }

  function cancel() {
    abortController?.abort();
    compressing = false;
  }
</script>

<form
  method="POST"
  action="?/upload"
  enctype="multipart/form-data"
  use:enhance
  bind:this={formEl}
>
  <label>
    Choose image
    <input
      bind:this={inputEl}
      type="file"
      name="image"
      accept="image/*"
      disabled={compressing}
      onchange={handleFileChange}
    />
  </label>

  {#if compressing}
    <progress value={progress} max={100}></progress>
    <button type="button" onclick={cancel}>Cancel</button>
  {/if}

  {#if preview}
    <img src={preview} alt="preview" style="max-width: 100%" />
    <p>{info}</p>
  {/if}

  <button type="submit" disabled={compressing || !preview}>Upload</button>
</form>
```

**`src/routes/upload/+page.server.ts`** — server action

```ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const actions: Actions = {
  upload: async ({ request }) => {
    const form = await request.formData();
    const file = form.get('image');

    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'No file provided' });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}-${file.name}`;
    await writeFile(join('static/uploads', filename), buffer);

    return { ok: true, path: `/uploads/${filename}` };
  },
};
```

## With progress + cancellation using a `$derived` store pattern

```svelte
<script lang="ts">
  import { compressImage } from 'omni-compress';

  let file = $state<File | null>(null);
  let result = $state<Awaited<ReturnType<typeof compressImage>> | null>(null);
  let progress = $state(0);
  let loading = $state(false);
  let abortController: AbortController | null = null;

  let savedPercent = $derived(result ? ((1 - result.ratio) * 100).toFixed(1) : '0');

  async function compress() {
    if (!file) return;
    loading = true;
    abortController = new AbortController();
    try {
      result = await compressImage(file, {
        format: 'avif',
        quality: 0.75,
        signal: abortController.signal,
        onProgress: (p) => { progress = p; },
      });
    } catch {}
    loading = false;
  }
</script>

<input type="file" accept="image/*" onchange={(e) => { file = e.currentTarget.files?.[0] ?? null; compress(); }} />
{#if loading}<progress value={progress} max={100}></progress><button onclick={() => abortController?.abort()}>Cancel</button>{/if}
{#if result}<p>Saved {savedPercent}% as {result.format.toUpperCase()}</p>{/if}
```

## Notes

- `omni-compress` is a browser-only library. SvelteKit runs `+page.server.ts` and `+layout.server.ts` in Node.js — never import `omni-compress` there. If you need server-side compression, import it inside an API route or `+server.ts` handler that is only reachable from the client.
- The `DataTransfer` trick (replacing `input.files`) is the standard way to programmatically set a file input's value before form submission. It works in all modern browsers.
- SvelteKit's `use:enhance` progressive enhancement submits the form without a full navigation, giving you `form.result` for optimistic UI updates without additional JavaScript.

---

**[← npm](https://www.npmjs.com/package/omni-compress)** · **[API Docs](https://dharanish-v.github.io/omni-compress/api/)** · **[Why omni-compress?](../why-omni-compress.md)**
