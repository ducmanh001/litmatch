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
    coverage: {
      reportsDirectory: '../../coverage/libs/api-client',
      provider: 'v8',
    },
  },
});
