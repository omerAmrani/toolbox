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
      command: 'NODE_ENV=test WEB_ORIGIN=http://localhost:3002 node dist/src/main.js',
      cwd: path.resolve(__dirname, '../open-uni-recorder-api'),
      url: 'http://localhost:3001/api/data-dir',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  globalTeardown: './tests/global-teardown.ts',
});
