import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

import { CORE_API_LOG } from './e2e/support/dev-otp';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

// Cổng riêng cho core-api CHỈ dành cho web:e2e — không dùng chung với PORT mặc định 3000 mà
// core-api-e2e/signaling-gateway-e2e cũng cần (xem comment ở webServer bên dưới).
const E2E_CORE_API_PORT = 3011;

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
   * máy có giới hạn fs.inotify.max_user_instances thấp (không sửa được, cần sudo). Core-api
   * chạy bằng `node dist/.../main.js` trực tiếp (KHÔNG qua `nx serve core-api`): target `serve`
   * của core-api là `continuous: true`, Nx chỉ cho 1 instance chạy/workspace — nếu
   * core-api-e2e cũng đang chạy `core-api:serve` song song (`nx run-many -t e2e --parallel=2`),
   * lệnh `nx serve` ở đây sẽ bị Nx treo lại chờ "process khác" thay vì tự khởi instance riêng,
   * webServer timeout. Build 1 lần rồi chạy thẳng file build ra bằng `node` để có instance độc
   * lập, PORT riêng (không phải 3000). apps/web/project.json khai `e2e.dependsOn:
   * ["core-api:migration-run"]` vì bỏ qua `nx serve` thì mất luôn phụ thuộc migration ngầm định. */
  webServer: [
    {
      // Redirect ra file cố định — spec đọc lại để lấy mã OTP dev-only (không có backdoor
      // API/DB nào trả plaintext OTP, đúng chủ đích, xem otp.service.ts — chỉ lưu codeHash).
      command: `npx nx build core-api --configuration=development && PORT=${E2E_CORE_API_PORT} node ${workspaceRoot}/dist/apps/core-api/main.js > ${CORE_API_LOG} 2>&1`,
      url: `http://localhost:${E2E_CORE_API_PORT}/health`,
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
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${E2E_CORE_API_PORT}`,
        // Máy dev/CI có thể có quota inotify thấp; polling giữ E2E độc lập với host limit.
        WATCHPACK_POLLING: 'true',
      },
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
