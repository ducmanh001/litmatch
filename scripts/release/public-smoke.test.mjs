import assert from 'node:assert/strict';
import test from 'node:test';

import { publicSmokeEndpoints, smokePublicEndpoints } from './public-smoke.mjs';

test('public smoke builds the four production paths from configured origins', () => {
  assert.deepEqual(
    publicSmokeEndpoints({
      PUBLIC_API_URL: 'https://api.example.com/',
      PUBLIC_SIGNALING_URL: 'https://signal.example.com',
      PUBLIC_WEB_URL: 'https://app.example.com/',
      PUBLIC_ADMIN_URL: 'https://admin.example.com/',
    }),
    {
      api: 'https://api.example.com/health/ready',
      signaling: 'https://signal.example.com/health/ready',
      web: 'https://app.example.com/',
      admin: 'https://admin.example.com/login',
    },
  );
});

test('public smoke probes all endpoints concurrently and retries non-2xx responses', async () => {
  const attempts = new Map();
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const name = new URL(url).hostname;
    const count = (attempts.get(name) ?? 0) + 1;
    attempts.set(name, count);
    await Promise.resolve();
    active -= 1;
    return { ok: count > 1, status: count > 1 ? 200 : 503 };
  };

  await smokePublicEndpoints({
    endpoints: {
      api: 'https://api.example.com/health/ready',
      web: 'https://app.example.com/',
    },
    fetchImpl,
    sleep: async () => {},
    attempts: 2,
    intervalMs: 0,
    log: () => {},
  });

  assert.equal(maxActive, 2);
  assert.deepEqual([...attempts.values()], [2, 2]);
});

test('public smoke fails closed after the bounded retry window', async () => {
  await assert.rejects(
    smokePublicEndpoints({
      endpoints: { api: 'https://api.example.com/health/ready' },
      fetchImpl: async () => ({ ok: false, status: 503 }),
      sleep: async () => {},
      attempts: 2,
      intervalMs: 0,
      log: () => {},
    }),
    /api smoke failed after 2 attempts: HTTP 503/u,
  );
});
