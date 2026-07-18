import { startIsolatedNodeServer } from '@litmatch/e2e-support';
import { resolve } from 'node:path';

module.exports = async function () {
  console.log('\nStarting an isolated signaling-gateway for E2E...\n');
  await startIsolatedNodeServer({
    name: 'signaling-gateway',
    workspaceRoot: resolve(__dirname, '../../../..'),
    entrypoint: 'dist/apps/signaling-gateway/main.js',
    portEnvironmentVariable: 'SIGNALING_PORT',
  });
};
