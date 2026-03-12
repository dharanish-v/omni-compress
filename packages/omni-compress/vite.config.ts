import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    dts({
      insertTypesEntry: true,
      include: ['ts-src/**/*.ts']
    })
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'ts-src/index.ts'),
        worker: resolve(__dirname, 'ts-src/worker.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: (id) => id.includes('omni_compress.js'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'pkg',
    emptyOutDir: false
  }
});
