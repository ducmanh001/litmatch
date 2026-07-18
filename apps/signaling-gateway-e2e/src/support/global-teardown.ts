import { stopIsolatedNodeServer } from '../../../../libs/e2e-support/src';

module.exports = async function () {
  stopIsolatedNodeServer('signaling-gateway');
  console.log('\nStopped the isolated signaling-gateway E2E process.\n');
};
