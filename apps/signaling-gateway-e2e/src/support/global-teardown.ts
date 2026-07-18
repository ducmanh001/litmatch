import { stopIsolatedNodeServer } from '@litmatch/e2e-support';

module.exports = async function () {
  stopIsolatedNodeServer('signaling-gateway');
  console.log('\nStopped the isolated signaling-gateway E2E process.\n');
};
