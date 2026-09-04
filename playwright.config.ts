import { defineConfig } from '@playwright/test';
import path from 'path';

const ROOT = path.join(__dirname);

export default defineConfig({
  testDir: path.join(ROOT, 'tests/e2e'),
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
