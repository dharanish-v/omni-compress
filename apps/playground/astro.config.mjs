import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://dharanish-v.github.io',
  base: '/omni-compress',
  integrations: [
    react(),
    sitemap()
  ],
  vite: {
    plugins: [tailwindcss()],
    worker: {
      format: 'es'
    },
    build: {
      rollupOptions: {
        external: ['child_process', 'os', 'path', 'fs', 'crypto']
      }
    }
  }
});
