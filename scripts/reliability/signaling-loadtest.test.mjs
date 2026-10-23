import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Execute the real k6 entrypoint against a controlled transport; no duplicate metric implementation.
const source = readFileSync(
  new URL('../../loadtest/signaling-ws.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export const options', 'const options')
  .replace('export default function ()', 'function attempt()');

function runAttempt(
  scenario,
  authResponse = {
    status: 201,
    body: JSON.stringify({ data: { accessToken: 'test-token' } }),
  },
) {
  const samples = new Map();
  let clock = 1000;
  let connected = false;
  class Metric {
    constructor(name) {
      this.name = name;
      samples.set(name, []);
    }
    add(value) {
      samples.get(this.name).push(value);
    }
  }
  const handlers = new Map();
  const timers = [];
  let closed = false;
  const emit = (event, data) => handlers.get(event)?.(data);
  const socket = {
    on: (event, callback) => handlers.set(event, callback),
    send: () => {},
    setTimeout: (callback, ms) => timers.push({ callback, due: clock + ms }),
    close: () => {
      if (!closed) {
        closed = true;
        emit('close');
      }
    },
  };
  const advance = (ms) => {
    const until = clock + ms;
    while (!closed) {
      timers.sort((a, b) => a.due - b.due);
      if (!timers[0] || timers[0].due > until) break;
      const timer = timers.shift();
      clock = timer.due;
      timer.callback();
    }
    clock = until;
  };
  runInNewContext(source + '\nattempt();', {
    __ENV: {},
    __VU: 1,
    Date: { now: () => clock },
    Trend: Metric,
    Rate: Metric,
    check: () => {},
    http: { post: () => authResponse },
    ws: {
      connect: (_url, _options, configure) => {
        connected = true;
        configure(socket);
        scenario({ emit, advance, close: socket.close });
        return { status: 101 };
      },
    },
  });
  return { samples, connected };
}

const open = (emit) => emit('message', '0{"sid":"transport"}');
const ack = (emit) => emit('message', '40/signaling,{"sid":"namespace"}');

test('a namespace session held for the requested duration records one successful attempt', () => {
  const { samples } = runAttempt(({ emit, advance }) => {
    open(emit);
    ack(emit);
    advance(20000);
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [0]);
  assert.deepEqual(samples.get('auth_fail_rate'), [0]);
});

test('an involuntary disconnect after CONNECT ack is a failure', () => {
  const { samples } = runAttempt(({ emit, close }) => {
    open(emit);
    ack(emit);
    close();
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
});

test('error followed by close contributes one failure, not two metric samples', () => {
  const { samples } = runAttempt(({ emit, close }) => {
    open(emit);
    ack(emit);
    emit('error');
    close();
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
});

test('server namespace DISCONNECT is a failed session', () => {
  const { samples } = runAttempt(({ emit }) => {
    open(emit);
    ack(emit);
    emit('message', '41/signaling,');
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
});

test('an acknowledgement for another namespace cannot count as admission', () => {
  const { samples } = runAttempt(({ emit, advance }) => {
    open(emit);
    emit('message', '40/other,{"sid":"other"}');
    advance(10000);
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
  assert.deepEqual(samples.get('socketio_connect_ack_latency'), []);
});

test('hold duration starts after admission, including a slow handshake', () => {
  const { samples } = runAttempt(({ emit, advance }) => {
    open(emit);
    advance(9000);
    ack(emit);
    advance(20000);
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [0]);
  assert.deepEqual(samples.get('socketio_connect_ack_latency'), [9000]);
});

test('namespace rejection counts once as a failed admission', () => {
  const { samples } = runAttempt(({ emit }) => {
    open(emit);
    emit('message', '44/signaling,{"message":"UNAUTHORIZED"}');
  });
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
  assert.deepEqual(samples.get('auth_fail_rate'), [1]);
});

test('malformed auth response fails the attempt without opening a socket', () => {
  const { samples, connected } = runAttempt(
    () => {
      assert.fail('must not connect');
    },
    { status: 201, body: 'not-json' },
  );
  assert.equal(connected, false);
  assert.deepEqual(samples.get('connection_drop_rate'), [1]);
  assert.deepEqual(samples.get('auth_fail_rate'), [1]);
});
