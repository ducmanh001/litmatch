/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SOCKET_URL: 'http://localhost:3001',
      NEXT_PUBLIC_LIVEKIT_URL: 'ws://localhost:7880',
      NEXT_PUBLIC_PHONE_OTP_ENABLED: 'true',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Gate coverage ratchet (docs/07 roadmap, cùng cơ chế chỉ-nâng-không-hạ như core-api).
    // Baseline đo 2026-07-13: stmts 71.73 / branch 60 / funcs 62.14 / lines 74.57. Threshold
    // giữ buffer ~2-3 điểm chống dao động instrumentation nhưng chỉ được nâng, không được hạ.
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8',
      thresholds: {
        statements: 69,
        branches: 57,
        functions: 59,
        lines: 72,
      },
    },
  },
});
