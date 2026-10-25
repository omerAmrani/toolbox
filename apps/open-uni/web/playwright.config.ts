import path from 'path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3002',
  },
  webServer: [
    {
      // .env.test enables Google login for the API auth specs; e2e runs in local mode (no login).
      // An empty var survives dotenv, which never overrides what's already set.
      command: 'GOOGLE_CLIENT_ID= NODE_ENV=test WEB_ORIGIN=http://localhost:3002 node dist/src/main.js',
      cwd: path.resolve(__dirname, '../api'),
      url: 'http://localhost:3001/api/data-dir',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      // Specs mock routes on localhost:3001 — pin it regardless of the lib/api.ts default.
      command: 'NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  globalTeardown: './tests/global-teardown.ts',
});
