import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    // Block service workers so coi-serviceworker.js doesn't trigger
    // a reload loop in CI (it calls location.reload() after installing
    // to apply COOP/COEP headers, which Playwright sees as infinite navigation)
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bunx astro preview --port 4321',
    url: 'http://localhost:4321/omni-compress',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
