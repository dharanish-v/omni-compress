import { defineConfig } from 'tsup';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig([
  // Main library entry — tree-shakeable with code splitting
  {
    entry: ['src/index.ts', 'src/compat/compressor.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: !isProd,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'es2022',
    // Externalize all Node.js built-ins so the ESM dist uses native `import`
    // instead of a bundled CJS require() shim (which breaks on Node 22+).
    // These are only reachable via the Node adapter (dynamically imported),
    // so browsers never encounter these imports.
    external: [
      'node:child_process', 'child_process',
      'node:os', 'os',
      'node:fs', 'fs', 'node:fs/promises', 'fs/promises',
      'node:path', 'path',
      'node:crypto', 'crypto',
      // ffmpeg-static is CJS and its internals call require('os') — bundling
      // it would break ESM mode on Node 22+. It's only used by the Node adapter.
      'ffmpeg-static',
    ],
  },
  // Worker entries — self-contained bundles (no splitting)
  // Workers load as standalone scripts via `new Worker(url)`, so they
  // cannot rely on relative chunk imports from the main build.
  {
    entry: {
      'workers/image.worker': 'src/workers/image.worker.ts',
      'workers/audio.worker': 'src/workers/audio.worker.ts',
      'workers/video.worker': 'src/workers/video.worker.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: !isProd,
    clean: false, // Don't wipe dist — main build already ran
    treeshake: true,
    minify: true,
    target: 'es2022',
    noExternal: [/.*/], // Bundle all deps into the worker files
  },
]);
