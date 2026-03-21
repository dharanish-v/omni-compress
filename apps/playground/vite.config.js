import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: process.env.NODE_ENV === 'production' ? '/omni-compress/' : '/',
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    build: {
        rollupOptions: {
            external: [
                'node:child_process',
                'node:os',
                'node:path',
                'node:crypto',
                'node:fs',
                'child_process',
                'os',
                'path',
                'crypto',
                'fs'
            ]
        }
    },
    worker: {
        format: 'es'
    }
});
