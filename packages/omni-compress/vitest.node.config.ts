import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'node',
    environment: 'node',
    include: ['tests/node/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
