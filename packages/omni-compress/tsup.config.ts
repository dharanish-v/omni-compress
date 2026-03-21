import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library entry — tree-shakeable with code splitting
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'es2022',
  },
  // Worker entries — self-contained bundles (no splitting)
  // Workers load as standalone scripts via `new Worker(url)`, so they
  // cannot rely on relative chunk imports from the main build.
  {
    entry: {
      'workers/image.worker': 'src/workers/image.worker.ts',
      'workers/audio.worker': 'src/workers/audio.worker.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false, // Don't wipe dist — main build already ran
    treeshake: true,
    minify: true,
    target: 'es2022',
    noExternal: [/.*/], // Bundle all deps into the worker files
  },
]);

