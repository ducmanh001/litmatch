#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_ATTEMPTS = 30;
const DEFAULT_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;

function joinUrl(origin, path) {
  const url = new URL(origin);
  url.pathname = `${url.pathname.replace(/\/$/u, '')}${path}`;
  return url.toString();
}

export function publicSmokeEndpoints(env = process.env) {
  const required = {
    api: env.PUBLIC_API_URL,
    signaling: env.PUBLIC_SIGNALING_URL,
    web: env.PUBLIC_WEB_URL,
    admin: env.PUBLIC_ADMIN_URL,
  };

  return Object.fromEntries(
    Object.entries(required).map(([name, origin]) => {
      if (!origin) throw new Error(`${name} public URL is required`);
      const path =
        name === 'api' || name === 'signaling'
          ? '/health/ready'
          : name === 'admin'
            ? '/login'
            : '/';
      return [name, joinUrl(origin, path)];
    }),
  );
}

export async function smokePublicEndpoints({
  endpoints,
  fetchImpl = fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = DEFAULT_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  log = console.log,
}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be a positive integer');
  }

  async function smoke(name, url) {
    let lastFailure = 'no response';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (response.ok) {
          log(`[smoke] ${name}: PASS`);
          return;
        }
        lastFailure = `HTTP ${response.status}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      if (attempt < attempts) await sleep(intervalMs);
    }
    throw new Error(
      `${name} smoke failed after ${attempts} attempts: ${lastFailure}`,
    );
  }

  await Promise.all(
    Object.entries(endpoints).map(([name, url]) => smoke(name, url)),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await smokePublicEndpoints({ endpoints: publicSmokeEndpoints() });
}
