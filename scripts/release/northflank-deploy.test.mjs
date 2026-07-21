import assert from 'node:assert/strict';
import test from 'node:test';

import { deployNorthflank, readConfig } from './northflank-deploy.mjs';

const validEnv = {
  NORTHFLANK_API_TOKEN: 'token',
  NORTHFLANK_PROJECT_ID: 'litmatch',
  NORTHFLANK_CORE_SERVICE_ID: 'core-api',
  NORTHFLANK_SIGNALING_SERVICE_ID: 'signaling-gateway',
  RELEASE_SHA: 'a'.repeat(40),
};

test('readConfig fail closed khi thiếu secret hoặc SHA không đầy đủ', () => {
  assert.throws(
    () => readConfig({ ...validEnv, NORTHFLANK_API_TOKEN: '' }),
    /NORTHFLANK_API_TOKEN is required/u,
  );
  assert.throws(
    () => readConfig({ ...validEnv, RELEASE_SHA: 'abc' }),
    /full Git commit SHA/u,
  );
});

test('deploy đúng commit cho hai service và chờ mỗi build thành công', async () => {
  const polls = new Map();
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (init.method === 'POST') {
      const serviceId = new URL(url).pathname.split('/').at(-2);
      return response({ data: { id: `build-${serviceId}` } });
    }
    const serviceId = new URL(url).pathname.split('/').at(-3);
    const count = (polls.get(serviceId) ?? 0) + 1;
    polls.set(serviceId, count);
    return response({
      data: {
        status: count === 1 ? 'BUILDING' : 'SUCCESS',
        concluded: count > 1,
      },
    });
  };

  await deployNorthflank({
    env: validEnv,
    fetchImpl,
    sleep: async () => {},
    log: () => {},
  });

  const posts = requests.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, 2);
  for (const { init } of posts) {
    assert.equal(init.headers.Authorization, 'Bearer token');
    assert.deepEqual(JSON.parse(init.body), { sha: validEnv.RELEASE_SHA });
  }
  assert.deepEqual([...polls.values()], [2, 2]);
});

test('deploy dừng khi Northflank kết luận build lỗi', async () => {
  const fetchImpl = async (_url, init) =>
    init.method === 'POST'
      ? response({ data: { id: 'failed-build' } })
      : response({ data: { status: 'FAILURE', concluded: true } });

  await assert.rejects(
    deployNorthflank({
      env: validEnv,
      fetchImpl,
      sleep: async () => {},
      log: () => {},
    }),
    /build concluded with FAILURE/u,
  );
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
