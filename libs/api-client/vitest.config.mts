/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/api-client',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'api-client',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Gate coverage ratchet (docs/07 roadmap, cùng cơ chế chỉ-nâng-không-hạ như core-api).
    // Baseline đo 2026-07-13: stmts 69.43 / branch 54.86 / funcs 65.95 / lines 75. Threshold
    // giữ buffer ~2-3 điểm chống dao động instrumentation nhưng chỉ được nâng, không được hạ.
    coverage: {
      reportsDirectory: '../../coverage/libs/api-client',
      provider: 'v8',
      thresholds: {
        statements: 67,
        branches: 52,
        functions: 63,
        lines: 73,
      },
    },
  },
});
