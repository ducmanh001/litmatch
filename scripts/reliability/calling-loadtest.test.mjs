import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// Execute the actual k6 scenario against controlled HTTP outcomes without contacting a service.
const source = readFileSync(
  new URL('../../loadtest/calling-flow.js', import.meta.url),
  'utf8',
)
  .replace("import http from 'k6/http';", 'const http = harness.http;')
  .replace(
    "import { check, sleep } from 'k6';",
    'const { check, sleep } = harness;',
  )
  .replace(
    "import { Counter, Rate, Trend } from 'k6/metrics';",
    'const { Counter, Rate, Trend } = harness;',
  )
  .replace('export const options =', 'const options =')
  .replace('export default function ()', 'function iteration()');

function scenario(overrides = {}) {
  const metrics = new Map();
  const calls = [];
  class Metric {
    constructor(name) {
      this.name = name;
      metrics.set(name, []);
    }
    add(value) {
      metrics.get(this.name).push(value);
    }
  }
  const response = (status, data) => ({
    status,
    body: JSON.stringify({ data }),
  });
  const ticket = { id: 'ticket-1', status: 'matched', sessionId: 'session-1' };
  const harness = {
    Counter: Metric,
    Rate: Metric,
    Trend: Metric,
    sleep() {},
    check(value, checks) {
      return Object.values(checks).every((check) => check(value));
    },
    http: {
      post(url) {
        calls.push(url);
        if (url.endsWith('/auth/guest'))
          return (
            overrides.login ?? response(201, { accessToken: 'test-token' })
          );
        if (url.endsWith('/matching/tickets'))
          return overrides.queue ?? response(201, ticket);
        if (url.endsWith('/confirm'))
          return (
            overrides.confirm ??
            response(200, { ...ticket, status: 'confirmed' })
          );
        if (url.endsWith('/join'))
          return overrides.join ?? response(201, { call: { id: 'call-1' } });
        if (url.endsWith('/end')) return overrides.end ?? response(200, {});
        throw new Error(`Unexpected POST ${url}`);
      },
      get(url) {
        calls.push(url);
        if (url.includes('/calling/calls/'))
          return (
            overrides.state ??
            response(200, { id: 'call-1', status: 'pending' })
          );
        return (
          overrides.poll ?? response(200, { ...ticket, status: 'confirmed' })
        );
      },
      del(url) {
        calls.push(`DELETE ${url}`);
        return response(200, {});
      },
    },
  };
  vm.runInNewContext(
    `${source}\nharness.options = options; harness.iteration = iteration;`,
    { harness, __ENV: { MATCH_WAIT_SECONDS: '1' }, __VU: 1 },
  );
  harness.iteration();
  return { metrics, calls, options: harness.options, response };
}

test('control-plane journey must complete and contribute exactly one success', () => {
  const { metrics, options } = scenario();
  assert.deepEqual(metrics.get('call_setup_success'), [true]);
  assert.deepEqual(metrics.get('call_setup_completed'), [1]);
  assert.equal(options.thresholds.call_setup_success[0], 'rate>0.95');
  assert.equal(options.thresholds.call_setup_completed[0], 'count>0');
});

for (const [name, overrides] of [
  ['login rejected', { login: { status: 401 } }],
  ['queue conflict', { queue: { status: 409 } }],
  ['confirmation rejected', { confirm: { status: 503 } }],
  ['call token rejected', { join: { status: 503 } }],
  ['call state unavailable', { state: { status: 500 } }],
  ['call cleanup rejected', { end: { status: 503 } }],
]) {
  test(`${name} is a failed journey, never a completed sample`, () => {
    const { metrics } = scenario(overrides);
    assert.deepEqual(metrics.get('call_setup_success'), [false]);
    assert.deepEqual(metrics.get('call_setup_completed'), []);
  });
}

test('failed call-state read still attempts to clean up the call', () => {
  const { calls, metrics } = scenario({ state: { status: 500 } });
  assert.ok(calls.some((url) => url.endsWith('/call-1/end')));
  assert.deepEqual(metrics.get('call_setup_success'), [false]);
});

test('matching timeout counts failure and cancels the outstanding ticket', () => {
  const queued = {
    status: 200,
    body: JSON.stringify({ data: { id: 'ticket-1', status: 'queued' } }),
  };
  const { metrics, calls } = scenario({
    queue: { ...queued, status: 201 },
    poll: queued,
  });
  assert.deepEqual(metrics.get('call_setup_success'), [false]);
  assert.ok(calls.some((url) => url.startsWith('DELETE ')));
  assert.ok(!calls.some((url) => url.endsWith('/join')));
});

test('a session id alone cannot bypass waiting for the other participant to confirm', () => {
  const unconfirmed = {
    status: 200,
    body: JSON.stringify({
      data: { id: 'ticket-1', status: 'matched', sessionId: 'session-1' },
    }),
  };
  const { metrics, calls } = scenario({
    confirm: unconfirmed,
    poll: unconfirmed,
  });
  assert.deepEqual(metrics.get('call_setup_success'), [false]);
  assert.ok(!calls.some((url) => url.endsWith('/join')));
});
