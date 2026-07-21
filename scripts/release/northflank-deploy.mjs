#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const REQUIRED_KEYS = [
  'NORTHFLANK_API_TOKEN',
  'NORTHFLANK_PROJECT_ID',
  'NORTHFLANK_CORE_SERVICE_ID',
  'NORTHFLANK_SIGNALING_SERVICE_ID',
  'RELEASE_SHA',
];

export function readConfig(env) {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) throw new Error(`${key} is required`);
  }
  if (!/^[0-9a-f]{40}$/u.test(env.RELEASE_SHA)) {
    throw new Error('RELEASE_SHA must be a full Git commit SHA');
  }
  return {
    token: env.NORTHFLANK_API_TOKEN,
    projectId: env.NORTHFLANK_PROJECT_ID,
    serviceIds: [
      env.NORTHFLANK_CORE_SERVICE_ID,
      env.NORTHFLANK_SIGNALING_SERVICE_ID,
    ],
    sha: env.RELEASE_SHA,
  };
}

export async function deployNorthflank({
  env,
  fetchImpl = fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = console.log,
}) {
  const config = readConfig(env);
  const baseUrl = `https://api.northflank.com/v1/projects/${encodeURIComponent(
    config.projectId,
  )}/services`;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  async function request(path, init) {
    const response = await fetchImpl(`${baseUrl}/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(
        `Northflank ${init?.method ?? 'GET'} ${path} failed with ${response.status}`,
      );
    }
    return response.json();
  }

  async function waitFor(serviceId, buildId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const result = await request(
        `${encodeURIComponent(serviceId)}/build/${encodeURIComponent(buildId)}`,
      );
      const { status, concluded } = result.data;
      log(`[northflank] ${serviceId} build ${status}`);
      if (concluded) {
        if (status !== 'SUCCESS') {
          throw new Error(`${serviceId} build concluded with ${status}`);
        }
        return;
      }
      await sleep(10_000);
    }
    throw new Error(`${serviceId} build timed out`);
  }

  async function deploy(serviceId) {
    const result = await request(`${encodeURIComponent(serviceId)}/build`, {
      method: 'POST',
      body: JSON.stringify({ sha: config.sha }),
    });
    await waitFor(serviceId, result.data.id);
  }

  await Promise.all(config.serviceIds.map((serviceId) => deploy(serviceId)));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await deployNorthflank({ env: process.env });
}
