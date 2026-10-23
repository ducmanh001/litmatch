import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => Number.isFinite(value) && value > 0;
const sha = /^[0-9a-f]{40}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const https = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
export const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateDeployment(deployment, expectedSha, now = Date.now()) {
  requireValue(sha.test(expectedSha), 'Expected full deployed SHA is required');
  requireValue(
    deployment && typeof deployment === 'object',
    'Deployment manifest is required',
  );
  requireValue(
    deployment.environment === 'staging' && deployment.gitSha === expectedSha,
    'Deployment must identify staging and match the deployed SHA',
  );
  const age = now - Date.parse(deployment.observedAt);
  requireValue(
    age >= 0 && age <= 86_400_000,
    'Deployment observation must be from the last 24 hours',
  );
  for (const key of [
    'owner',
    'region',
    'dataProfile',
    'configurationProfile',
  ]) {
    requireValue(text(deployment[key]), `Deployment ${key} is required`);
  }
  requireValue(
    https(deployment.observationUrl),
    'Deployment observationUrl must link to HTTPS evidence',
  );
  requireValue(
    digest.test(deployment.configurationDigest),
    'Sanitized deployment configurationDigest must be sha256',
  );
  for (const name of ['core-api', 'signaling-gateway', 'media-server']) {
    const service = deployment.services?.[name];
    requireValue(
      service && digest.test(service.imageDigest),
      `${name} imageDigest is required`,
    );
    requireValue(
      Number.isInteger(service.replicas) && service.replicas > 0,
      `${name} replicas must be positive`,
    );
    for (const key of ['instanceClass', 'cpuLimit', 'memoryLimit']) {
      requireValue(text(service[key]), `${name} ${key} is required`);
    }
  }
  for (const name of ['postgres', 'redis', 'generator']) {
    const resource = deployment[name];
    requireValue(
      resource && text(resource.instanceClass) && text(resource.topology),
      `${name} instanceClass/topology are required`,
    );
  }
  requireValue(
    positive(deployment.postgres.storageGiB) &&
      positive(deployment.postgres.maxConnections),
    'Postgres storageGiB/maxConnections are required',
  );
  requireValue(
    positive(deployment.redis.memoryMiB) &&
      positive(deployment.redis.maxConnections),
    'Redis memoryMiB/maxConnections are required',
  );
  requireValue(
    text(deployment.generator.region) &&
      positive(deployment.generator.instances),
    'Generator region/instances are required',
  );
  return deployment;
}

export function validateTargets(targets, api, signaling) {
  for (const [name, actual] of Object.entries({ api, signaling })) {
    const url = new URL(actual);
    requireValue(
      url.protocol === (name === 'api' ? 'https:' : 'wss:') &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /stag(?:e|ing)|stg/i.test(url.hostname),
      `${name} must be a staging TLS URL without credentials/query/fragment`,
    );
    requireValue(
      targets?.[name] === actual,
      `${name} must match the deployment observation target`,
    );
  }
}

const scenarios = {
  matching: {
    script: 'loadtest/matching-queue.js',
    latency: 'join_queue_latency',
    error: 'errors',
    requiredThresholds: [
      'http_req_duration{endpoint:join_queue}',
      'http_req_duration{endpoint:get_ticket}',
      'http_req_duration{endpoint:cancel_ticket}',
      'errors',
    ],
  },
  calling: {
    script: 'loadtest/calling-flow.js',
    latency: 'match_to_call_joined_latency',
    error: 'errors',
    requiredThresholds: [
      'http_req_duration{endpoint:join_call}',
      'errors',
      'call_setup_success',
      'call_setup_completed',
    ],
  },
  signaling: {
    script: 'loadtest/signaling-ws.js',
    latency: 'socketio_connect_ack_latency',
    error: 'connection_drop_rate',
    requiredThresholds: [
      'ws_connecting',
      'socketio_connect_ack_latency',
      'connection_drop_rate',
    ],
  },
};

export function buildReport(metadata, summaries, jobStatus) {
  const problems = [];
  const workloads = {};
  for (const [name, scenario] of Object.entries(scenarios)) {
    const summary = summaries[name];
    const metrics = summary?.metrics;
    const latency =
      metrics?.[scenario.latency]?.values ?? metrics?.[scenario.latency];
    const errors =
      metrics?.[scenario.error]?.values ?? metrics?.[scenario.error];
    if (
      !positive(latency?.count) ||
      !Number.isFinite(latency?.['p(95)']) ||
      !Number.isFinite(latency?.['p(99)']) ||
      latency['p(95)'] < 0 ||
      latency['p(99)'] < latency['p(95)']
    ) {
      problems.push(`${name}: populated latency count/p95/p99 required`);
    }
    if (!Number.isFinite(errors?.rate) || errors.rate < 0 || errors.rate > 1) {
      problems.push(`${name}: valid error rate required`);
    }
    for (const metricName of scenario.requiredThresholds) {
      const thresholds = metrics?.[metricName]?.thresholds;
      if (
        !thresholds ||
        typeof thresholds !== 'object' ||
        !Object.keys(thresholds).length
      ) {
        problems.push(`${name}: ${metricName} threshold results required`);
      }
    }
    for (const [metricName, metric] of Object.entries(metrics ?? {})) {
      for (const [expression, result] of Object.entries(
        metric.thresholds ?? {},
      )) {
        // Legacy summary-export booleans mean LastFailed; handleSummary uses {ok}.
        const passed = typeof result === 'boolean' ? !result : result?.ok;
        if (passed !== true)
          problems.push(
            `${name}: ${metricName} ${expression} failed or unverified`,
          );
      }
    }
    workloads[name] = {
      ...scenario,
      p95Ms: latency?.['p(95)'] ?? null,
      p99Ms: latency?.['p(99)'] ?? null,
      samples: latency?.count ?? 0,
      errorRate: errors?.rate ?? null,
      // Preserve k6's native threshold representation and all per-endpoint metrics.
      metrics: metrics ?? null,
      rawSummary: `${name}-summary.json`,
    };
  }
  if (jobStatus !== 'success')
    problems.push('Workload process/threshold execution did not succeed');
  return {
    schemaVersion: 1,
    ...metadata,
    finishedAt: new Date().toISOString(),
    status: problems.length ? 'FAIL' : 'PASS',
    problems,
    workloads,
    recovery: {
      gateway: {
        status: 'NOT_RUN',
        reason:
          'Requires approved pod-loss/reconnect observation through the load balancer, logs and measured recovery duration',
      },
      worker: {
        status: 'NOT_RUN',
        reason:
          'Requires approved worker interruption, durable backlog/catch-up observations, logs and measured recovery duration',
      },
    },
    qualification: 'NOT_QUALIFIED',
  };
}

async function main() {
  const directory = resolve(
    process.env['BENCHMARK_DIR'] ?? 'artifacts/staging-reliability',
  );
  await mkdir(directory, { recursive: true });
  if (process.argv[2] === 'prepare') {
    const deployment = validateDeployment(
      JSON.parse(process.env['DEPLOYMENT_MANIFEST'] ?? 'null'),
      process.env['DEPLOYED_SHA'],
    );
    validateTargets(
      deployment.targets,
      process.env['BASE_URL'],
      process.env['SIGNALING_URL'],
    );
    const vus = Number(process.env['VUS']);
    const duration = process.env['DURATION'];
    requireValue(
      Number.isInteger(vus) && vus >= 2 && vus <= 9999 && vus % 2 === 0,
      'VUS must be even, 2..9999 for paired calling workload',
    );
    requireValue(
      /^[1-9][0-9]*(s|m|h)$/.test(duration),
      'DURATION must be a positive k6 duration',
    );
    requireValue(
      text(process.env['CHANGE_TICKET']),
      'Approved CHANGE_TICKET is required',
    );
    await writeFile(
      resolve(directory, 'metadata.json'),
      JSON.stringify(
        {
          gitSha: deployment.gitSha,
          deployment,
          deploymentHash: hash(deployment),
          deploymentProvenance:
            'Operator-supplied observation; not independently verified by this runner',
          targets: {
            api: process.env['BASE_URL'],
            signaling: process.env['SIGNALING_URL'],
          },
          workload: {
            vusPerScenario: vus,
            durationPerScenario: duration,
            execution: 'sequential constant-vus',
            matchType: 'voice',
            matchWaitSeconds: 30,
            holdSeconds: 20,
            connectTimeoutSeconds: 10,
          },
          runner: {
            k6Image: 'grafana/k6:1.7.0',
            runId: process.env['GITHUB_RUN_ID'] ?? null,
            runAttempt: process.env['GITHUB_RUN_ATTEMPT'] ?? null,
            runUrl: process.env['GITHUB_RUN_ID']
              ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
              : null,
          },
          changeTicket: process.env['CHANGE_TICKET'],
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else if (process.argv[2] === 'report') {
    const metadata = JSON.parse(
      await readFile(resolve(directory, 'metadata.json'), 'utf8'),
    );
    const summaries = {};
    for (const name of Object.keys(scenarios)) {
      try {
        summaries[name] = JSON.parse(
          await readFile(resolve(directory, `${name}-summary.json`), 'utf8'),
        );
      } catch {
        summaries[name] = null;
      }
    }
    const report = buildReport(metadata, summaries, process.env['JOB_STATUS']);
    await writeFile(
      resolve(directory, 'benchmark.json'),
      JSON.stringify(report, null, 2),
    );
    requireValue(report.status === 'PASS', report.problems.join('; '));
  } else {
    throw new Error(
      'Usage: node scripts/reliability/staging-benchmark.mjs prepare|report',
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
