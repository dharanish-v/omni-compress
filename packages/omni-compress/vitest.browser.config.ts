import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'browser',
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      provider: 'playwright',
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
  optimizeDeps: {
    exclude: ['@jsquash/avif'],
  },
});
