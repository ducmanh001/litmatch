import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildReport,
  validateDeployment,
  validateTargets,
} from './staging-benchmark.mjs';

const gitSha = 'a'.repeat(40);
function deployment() {
  return {
    environment: 'staging',
    gitSha,
    observedAt: new Date().toISOString(),
    owner: 'operator',
    observationUrl: 'https://evidence.invalid/deployments/1',
    region: 'test-region',
    dataProfile: 'synthetic 1000 accounts, empty message history',
    configurationProfile:
      'two gateway replicas; worker interval 100ms; outbox disabled',
    configurationDigest: `sha256:${'b'.repeat(64)}`,
    targets: {
      api: 'https://staging.example.invalid',
      signaling: 'wss://staging-ws.example.invalid',
    },
    services: Object.fromEntries(
      ['core-api', 'signaling-gateway', 'media-server'].map((name) => [
        name,
        {
          imageDigest: `sha256:${'c'.repeat(64)}`,
          replicas: 2,
          instanceClass: 'test',
          cpuLimit: '1',
          memoryLimit: '512Mi',
        },
      ]),
    ),
    postgres: {
      instanceClass: 'test',
      topology: 'single primary',
      storageGiB: 20,
      maxConnections: 100,
    },
    redis: {
      instanceClass: 'test',
      topology: 'single shard',
      memoryMiB: 512,
      maxConnections: 100,
    },
    generator: {
      instanceClass: 'test',
      topology: 'outside service fleet',
      instances: 1,
      region: 'test-region',
    },
  };
}
function summaries() {
  const result = Object.fromEntries(
    [
      ['matching', 'join_queue_latency', 'errors'],
      ['calling', 'match_to_call_joined_latency', 'errors'],
      ['signaling', 'socketio_connect_ack_latency', 'connection_drop_rate'],
    ].map(([name, latency, error]) => [
      name,
      {
        metrics: {
          [latency]: { count: 4, 'p(95)': 50, 'p(99)': 80 },
          [error]: { rate: 0.01, thresholds: { 'rate<0.05': false } },
        },
      },
    ]),
  );
  const required = {
    matching: [
      'http_req_duration{endpoint:join_queue}',
      'http_req_duration{endpoint:get_ticket}',
      'http_req_duration{endpoint:cancel_ticket}',
    ],
    calling: [
      'http_req_duration{endpoint:join_call}',
      'call_setup_success',
      'call_setup_completed',
    ],
    signaling: ['ws_connecting', 'socketio_connect_ack_latency'],
  };
  for (const [scenario, metrics] of Object.entries(required)) {
    for (const name of metrics) {
      result[scenario].metrics[name] = {
        ...result[scenario].metrics[name],
        thresholds: { 'test expression': false },
      };
    }
  }
  return result;
}

test('legacy and structured threshold failures override a successful job; missing or unknown results fail closed', () => {
  for (const threshold of [true, { ok: false }, {}, null, 'false']) {
    const data = summaries();
    data.calling.metrics.errors.thresholds['rate<0.05'] = threshold;
    assert.equal(buildReport({}, data, 'success').status, 'FAIL');
  }
  const structured = summaries();
  structured.calling.metrics.errors = {
    values: { rate: 0.01 },
    thresholds: { 'rate<0.05': { ok: true } },
  };
  assert.equal(buildReport({}, structured, 'success').status, 'PASS');
  delete structured.signaling.metrics.ws_connecting.thresholds;
  assert.equal(buildReport({}, structured, 'success').status, 'FAIL');
  for (const [stat, value] of [
    ['p(95)', -1],
    ['p(99)', -1],
    ['p(99)', 40],
  ]) {
    const invalid = summaries();
    invalid.matching.metrics.join_queue_latency[stat] = value;
    assert.equal(buildReport({}, invalid, 'success').status, 'FAIL');
  }
});

test('deployment rejects missing, stale, mismatched and incomplete observations', () => {
  assert.equal(validateDeployment(deployment(), gitSha).gitSha, gitSha);
  for (const value of [
    null,
    { ...deployment(), gitSha: 'b'.repeat(40) },
    { ...deployment(), environment: 'production' },
    { ...deployment(), observedAt: '2000-01-01' },
    { ...deployment(), services: {} },
    { ...deployment(), configurationDigest: '' },
    { ...deployment(), observationUrl: 'https://user:secret@example.invalid' },
  ]) {
    assert.throws(() => validateDeployment(value, gitSha));
  }
});

test('runner must target exactly the observed staging URLs without URL secrets', () => {
  const targets = deployment().targets;
  validateTargets(targets, targets.api, targets.signaling);
  assert.throws(() =>
    validateTargets(
      targets,
      'https://other-staging.invalid',
      targets.signaling,
    ),
  );
  assert.throws(() =>
    validateTargets(
      targets,
      'https://staging.invalid?token=secret',
      targets.signaling,
    ),
  );
});

test('report preserves measured tail latency, rate and native thresholds; recovery is never inferred', () => {
  const report = buildReport({ gitSha }, summaries(), 'success');
  assert.equal(report.status, 'PASS');
  assert.equal(report.workloads.calling.p99Ms, 80);
  assert.equal(report.workloads.matching.errorRate, 0.01);
  assert.deepEqual(report.workloads.matching.metrics.errors.thresholds, {
    'rate<0.05': false,
  });
  assert.equal(report.recovery.gateway.status, 'NOT_RUN');
  assert.equal(report.recovery.worker.status, 'NOT_RUN');
  assert.equal(report.qualification, 'NOT_QUALIFIED');
});

test('missing summaries, no samples, absent p99, invalid rate and failed processes fail closed', () => {
  assert.equal(buildReport({}, {}, 'success').status, 'FAIL');
  for (const mutate of [
    (s) => {
      s.matching.metrics.join_queue_latency.count = 0;
    },
    (s) => {
      delete s.calling.metrics.match_to_call_joined_latency['p(99)'];
    },
    (s) => {
      s.signaling.metrics.connection_drop_rate.rate = 2;
    },
  ]) {
    const data = summaries();
    mutate(data);
    assert.equal(buildReport({}, data, 'success').status, 'FAIL');
  }
  assert.equal(buildReport({}, summaries(), 'failure').status, 'FAIL');
});

test('CLI rejects an absent manifest before writing metadata', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'litmatch-benchmark-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./staging-benchmark.mjs', import.meta.url)),
        'prepare',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BENCHMARK_DIR: directory,
          DEPLOYED_SHA: gitSha,
          DEPLOYMENT_MANIFEST: '',
        },
      },
    );
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(resolve(directory, 'metadata.json')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI links real files to the deployment hash and retains a failed report for missing results', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'litmatch-benchmark-'));
  const observed = deployment();
  const env = {
    ...process.env,
    BENCHMARK_DIR: directory,
    DEPLOYED_SHA: gitSha,
    DEPLOYMENT_MANIFEST: JSON.stringify(observed),
    BASE_URL: observed.targets.api,
    SIGNALING_URL: observed.targets.signaling,
    VUS: '20',
    DURATION: '2m',
    CHANGE_TICKET: 'test-approved-ticket',
    JOB_STATUS: 'success',
  };
  const run = (mode) =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./staging-benchmark.mjs', import.meta.url)),
        mode,
      ],
      { encoding: 'utf8', env },
    );
  try {
    const prepared = run('prepare');
    assert.equal(prepared.status, 0, prepared.stderr);
    const missing = run('report');
    assert.notEqual(missing.status, 0);
    assert.equal(
      JSON.parse(await readFile(resolve(directory, 'benchmark.json'), 'utf8'))
        .status,
      'FAIL',
    );
    for (const [name, data] of Object.entries(summaries())) {
      await writeFile(
        resolve(directory, `${name}-summary.json`),
        JSON.stringify(data),
      );
    }
    const completed = run('report');
    assert.equal(completed.status, 0, completed.stderr);
    const report = JSON.parse(
      await readFile(resolve(directory, 'benchmark.json'), 'utf8'),
    );
    assert.equal(report.gitSha, gitSha);
    assert.match(report.deploymentHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(report.deployment, observed);
    assert.equal(report.workload.vusPerScenario, 20);
    assert.equal(report.recovery.worker.status, 'NOT_RUN');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
