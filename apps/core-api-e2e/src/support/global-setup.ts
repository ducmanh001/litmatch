import { startIsolatedNodeServer } from '@litmatch/e2e-support';
import { resolve } from 'node:path';

module.exports = async function () {
  console.log('\nStarting an isolated core-api for E2E...\n');
  await startIsolatedNodeServer({
    name: 'core-api',
    workspaceRoot: resolve(__dirname, '../../../..'),
    entrypoint: 'dist/apps/core-api/main.js',
    environment: { AUTH_CROSS_ORIGIN_DEV: 'false' },
  });
};
