import { killPort } from '@nx/node/utils';

module.exports = async function () {
  // Put clean up logic here (e.g. stopping services, docker-compose, etc.).
  // Hint: `globalThis` is shared between setup and teardown.
  const port = process.env.SIGNALING_PORT
    ? Number(process.env.SIGNALING_PORT)
    : 3001;
  await killPort(port);
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
