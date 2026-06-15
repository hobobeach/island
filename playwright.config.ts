import { defineConfig, devices } from '@playwright/test';

// Run the e2e server on a dedicated port so it never collides with a running
// `npm run dev` (3000) and never trips the server's EADDRINUSE port-bump.
const PORT = process.env.TEST_PORT || '3100';
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx ts-node src/server.ts',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT,
      NODE_ENV: process.env.NODE_ENV || 'development',
      // jwt.ts throws at import time without this; provide a dummy for tests.
      JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-secret',
    },
  },
});
