// The end-to-end gate, kept deliberately separate from the unit gate.
//
// `npm run check` is typecheck + vitest, and vitest's `include` in vite.config.ts
// lists only tests/core and tests/state -- so nothing here is ever picked up by it,
// and a browser is never needed to prove the core is correct. `npm run test:e2e`
// is the second gate, and it drives the real app in a real browser against a
// mocked OpenWrt.
//
// Two projects:
//
//   e2e      the assertions (T087, T088, T089). This is the gate.
//   screens  the manual passes (T090, T091). It captures screenshots for a human
//            to look at and asserts nothing, because "does 375px read well" and
//            "is the Polish translation sensible" are not machine questions.
//
// The dev server is the target rather than a preview of `dist/`: it serves the
// canonical wrtnova.sh from the repo root through the middleware in
// vite.config.ts, so an e2e build reads the same bytes the user maintains.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 5174);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  // A build polls the mocked server on a 5s interval, and the fleet test runs
  // four of them, so the default 30s is genuinely too short here.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'e2e',
      testIgnore: /\.screens\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'screens',
      testMatch: /\.screens\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // --host 127.0.0.1 is not decoration: Vite's default bind is `localhost`,
    // which on macOS resolves to ::1 only, and then nothing reaches the server on
    // the IPv4 address every URL here is written against.
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
