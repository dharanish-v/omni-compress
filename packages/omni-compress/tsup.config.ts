import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/workers/image.worker.ts', 'src/workers/audio.worker.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  target: 'es2022',
  noExternal: ['mp4box'],
});

