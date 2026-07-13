/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/admin',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  build: {
    outDir: '../../dist/apps/admin',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'admin',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    env: {
      VITE_API_URL: 'http://localhost:3000',
    },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Gate coverage ratchet (docs/07 roadmap, cùng cơ chế chỉ-nâng-không-hạ như core-api).
    // Baseline đo 2026-07-13: stmts 81.51 / branch 70.33 / funcs 77.77 / lines 82.53. Threshold
    // giữ buffer ~2-3 điểm chống dao động instrumentation nhưng chỉ được nâng, không được hạ.
    coverage: {
      reportsDirectory: '../../coverage/apps/admin',
      provider: 'v8' as const,
      thresholds: {
        statements: 79,
        branches: 68,
        functions: 75,
        lines: 80,
      },
    },
  },
}));
