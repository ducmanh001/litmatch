import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

import { CORE_API_LOG } from './e2e/support/dev-otp';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import 'dotenv/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Run your local dev server before starting the tests — --webpack vì Turbopack panic trên
   * máy có giới hạn fs.inotify.max_user_instances thấp (không sửa được, cần sudo). */
  webServer: [
    {
      // Redirect ra file cố định — spec đọc lại để lấy mã OTP dev-only (không có backdoor
      // API/DB nào trả plaintext OTP, đúng chủ đích, xem otp.service.ts — chỉ lưu codeHash).
      command: `npx nx serve core-api > ${CORE_API_LOG} 2>&1`,
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 60_000,
    },
    {
      command: 'npx next dev --port=4300 --webpack',
      url: 'http://localhost:4300',
      reuseExistingServer: true,
      cwd: `${workspaceRoot}/apps/web`,
      timeout: 60_000,
    },
  ],
  // Dùng Google Chrome cài sẵn trên máy (channel: 'chrome') — Playwright tự quản lý Chromium
  // cần OS deps (libavif13...) không có sudo để cài; firefox/webkit cùng lý do, không set up.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
