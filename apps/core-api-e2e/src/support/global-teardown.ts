import { stopIsolatedNodeServer } from './isolated-node-server';

module.exports = async function () {
  stopIsolatedNodeServer('core-api');
  console.log('\nStopped the isolated core-api E2E process.\n');
};
