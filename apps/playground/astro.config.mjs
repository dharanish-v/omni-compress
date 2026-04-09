import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// https://astro.build/config
export default defineConfig({
  site: 'https://dharanish-v.github.io',
  base: '/omni-compress',
  integrations: [
    react(),
    sitemap()
  ],
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'configure-response-headers',
        configureServer: (server) => {
          server.middlewares.use((_req, res, next) => {
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            next();
          });
        },
      },
      {
        // Serve TypeDoc static files at /omni-compress/api/ before Astro's
        // [theme].astro dynamic route can intercept the request.
        name: 'serve-api-docs',
        configureServer: (server) => {
          const apiDir = join(__dirname, 'public', 'api');
          server.middlewares.use('/omni-compress/api', (req, res, next) => {
            if (!existsSync(apiDir)) return next();
            const urlPath = req.url === '/' || req.url === '' ? '/index.html' : req.url;
            const filePath = join(apiDir, urlPath.split('?')[0]);
            if (existsSync(filePath) && statSync(filePath).isFile()) {
              res.setHeader('Content-Type', MIME[extname(filePath)] || 'text/plain');
              createReadStream(filePath).pipe(res);
            } else {
              next();
            }
          });
        },
      }
    ],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@jsquash/avif']
    },
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
