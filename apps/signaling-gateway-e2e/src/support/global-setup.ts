import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  // Start services that that the app needs to run (e.g. database, docker-compose, etc.).
  console.log('\nSetting up...\n');

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.SIGNALING_PORT
    ? Number(process.env.SIGNALING_PORT)
    : 3001;
  // Fail trong khoảng 30 giây thay vì để CI treo 2 phút nếu serve target chết trước khi mở port.
  await waitForPortOpen(port, { host, retries: 60, retryDelay: 500 });

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
