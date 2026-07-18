import { stopIsolatedNodeServer } from '../../../../libs/e2e-support/src';

module.exports = async function () {
  stopIsolatedNodeServer('core-api');
  console.log('\nStopped the isolated core-api E2E process.\n');
};
