#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const profile = process.argv[2] ?? 'ci';
const dryRun = process.argv.includes('--dry-run');
const bypassRequested =
  process.argv.includes('--bypass') ||
  ['1', 'true', 'yes', 'on'].includes(
    (process.env['LITMATCH_CI_BYPASS'] ?? process.env['CI_BYPASS'] ?? '')
      .trim()
      .toLowerCase(),
  );
const runningInCi = ['1', 'true', 'yes', 'on'].includes(
  (process.env['CI'] ?? process.env['GITHUB_ACTIONS'] ?? '')
    .trim()
    .toLowerCase(),
);
const cleanRunnerImage =
  process.env['LOCAL_CI_NODE_IMAGE'] ??
  'node:22-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365';
const securityToolsScript = fileURLToPath(
  new URL('./security-tools.mjs', import.meta.url),
);
const stageRunnerScript = fileURLToPath(
  new URL('./run-stage.mjs', import.meta.url),
);
const stageTimeoutMs = Number(
  process.env['LOCAL_CI_STAGE_TIMEOUT_MS'] ?? 20 * 60 * 1000,
);
const localCiNxRoot = join(tmpdir(), 'litmatch-local-ci', String(process.pid));
const supportedProfiles = new Set([
  'quick',
  'clean',
  'ci',
  'docker',
  'security',
  'all',
]);

if (!supportedProfiles.has(profile)) {
  console.error(
    `Local CI profile không hợp lệ: ${profile}. Hỗ trợ: ${[...supportedProfiles].join(', ')}`,
  );
  process.exit(1);
}

if (bypassRequested) {
  if (runningInCi) {
    console.error(
      `[ci-local] Refusing bypass for profile ${profile} in a CI environment.`,
    );
    process.exit(1);
  }
  console.log(
    `[ci-local] Bypass enabled for profile ${profile}${
      process.env['LITMATCH_CI_BYPASS_REASON']
        ? `: ${process.env['LITMATCH_CI_BYPASS_REASON']}`
        : ''
    }`,
  );
  process.exit(0);
}

const environment = {
  // GitHub Actions does not use the Nx daemon. Disable it locally too: it avoids file-watch
  // limits on developer machines and catches the same cold-run behavior as CI.
  CI: 'true',
  HUSKY: '0',
  NX_DAEMON: 'false',
  JWT_SECRET:
    process.env['LOCAL_CI_JWT_SECRET'] ?? 'local-ci-jwt-0123456789abcdef-xyz',
  AUTH_OTP_PEPPER:
    process.env['LOCAL_CI_AUTH_OTP_PEPPER'] ?? 'local-ci-pepper-0123456789',
  AUTH_GUEST_DEVICE_TOKEN_SECRET:
    process.env['LOCAL_CI_AUTH_GUEST_DEVICE_TOKEN_SECRET'] ??
    'local-ci-guest-device-secret-0123456789abcdef',
  MATCHING_GUEST_QUOTA_PEPPER:
    process.env['LOCAL_CI_MATCHING_GUEST_QUOTA_PEPPER'] ??
    'local-ci-matching-quota-pepper-0123456789abcdef',
  DATABASE_URL:
    process.env['LOCAL_CI_DATABASE_URL'] ??
    'postgresql://litmatch:litmatch_local@localhost:5432/litmatch_ci',
  REDIS_URL: process.env['LOCAL_CI_REDIS_URL'] ?? 'redis://localhost:6379/15',
  INTEGRATION_DB_URL:
    process.env['LOCAL_CI_INTEGRATION_DB_URL'] ??
    'postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test',
  NEXT_PUBLIC_API_URL:
    process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000',
  NEXT_PUBLIC_SOCKET_URL:
    process.env['NEXT_PUBLIC_SOCKET_URL'] ?? 'http://localhost:3001',
  NEXT_PUBLIC_LIVEKIT_URL:
    process.env['NEXT_PUBLIC_LIVEKIT_URL'] ?? 'ws://localhost:7880',
  NX_TUI: 'false',
  NX_CACHE_DIRECTORY:
    process.env['LOCAL_CI_NX_CACHE_DIRECTORY'] ?? join(localCiNxRoot, 'cache'),
  NX_WORKSPACE_DATA_DIRECTORY:
    process.env['LOCAL_CI_NX_WORKSPACE_DATA_DIRECTORY'] ??
    join(localCiNxRoot, 'workspace-data'),
};

let dependenciesPrepared = false;
let nxPrepared = false;

function commandText(command) {
  return `${command} [args hidden]`;
}

function run(label, command, args, options = {}) {
  console.log(`\n[ci-local] ${label}`);
  console.log(`[ci-local] $ ${commandText(command)}`);

  if (dryRun) return 0;

  const timeoutMs = options.timeoutMs ?? stageTimeoutMs;
  const ownsInnerWatchdogs = options.ownsInnerWatchdogs === true;
  const result = spawnSync(
    ownsInnerWatchdogs ? command : process.execPath,
    ownsInnerWatchdogs ? args : [stageRunnerScript, command, ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        ...environment,
        ...(options.env ?? {}),
        ...(!ownsInnerWatchdogs && {
          LITMATCH_STAGE_LABEL: label,
          LITMATCH_STAGE_TIMEOUT_MS: String(timeoutMs),
        }),
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    if (options.allowFailure) return 1;
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }

  return result.status ?? 1;
}

function commandSucceeds(command, args) {
  if (dryRun) return true;
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: 'ignore',
    timeout: 10_000,
    killSignal: 'SIGKILL',
  });
  return result.status === 0;
}

function prepareDependencies() {
  if (dependenciesPrepared) return;
  run('Install dependencies from the lockfile', pnpm, [
    'install',
    '--frozen-lockfile',
  ]);
  dependenciesPrepared = true;
}

function prepareNx() {
  if (nxPrepared) return;
  run('Reset Nx daemon and project-graph cache', pnpm, [
    'nx',
    'reset',
    '--outputStyle=static',
  ]);
  nxPrepared = true;
}

function startTestServices() {
  if (process.env['LOCAL_CI_SERVICES_READY'] === 'true') {
    console.log('\n[ci-local] Reuse CI-provided PostgreSQL and Redis');
    return;
  }

  const postgresReady =
    !dryRun &&
    commandSucceeds('docker', [
      'exec',
      'litmatch-postgres',
      'pg_isready',
      '--username',
      'litmatch',
    ]);
  const redisReady =
    !dryRun &&
    commandSucceeds('docker', ['exec', 'litmatch-redis', 'redis-cli', 'ping']);

  if (postgresReady && redisReady) {
    console.log('\n[ci-local] Reuse healthy local PostgreSQL and Redis');
    return;
  }

  run('Start local PostgreSQL and Redis', 'docker', [
    'compose',
    'up',
    '--detach',
    '--wait',
    'postgres',
    'redis',
  ]);
}

function runQuality() {
  prepareDependencies();
  prepareNx();
  run('Agent contract and guard checks', pnpm, ['agent:check']);
  run('Agent guard tests', pnpm, ['agent:test']);
  runWorkflowLint();
  run('Format check', pnpm, ['format:check']);
  run('Lint every Nx project', pnpm, [
    'nx',
    'run-many',
    '-t',
    'lint',
    '--outputStyle=static',
  ]);
}

function runCleanQuality() {
  if (!dryRun) mkdirSync(join(root, '.nx'), { recursive: true });

  const shellQuote = (value) => `'${value.replaceAll("'", "'\"'\"'")}'`;
  const stage = (label, command) =>
    `LITMATCH_STAGE_LABEL=${shellQuote(label)} ` +
    `LITMATCH_STAGE_TIMEOUT_MS=${stageTimeoutMs} ` +
    `node scripts/ci/run-stage.mjs bash -lc ${shellQuote(command)}`;
  const command = [
    'git config --global --add safe.directory /workspace',
    'corepack enable',
    stage(
      'clean: install dependencies',
      'pnpm install --store-dir /pnpm/store --frozen-lockfile',
    ),
    stage('clean: reset Nx', 'pnpm nx reset --outputStyle=static'),
    stage('clean: agent check', 'pnpm agent:check'),
    stage('clean: agent tests', 'pnpm agent:test'),
    stage(
      'clean: workflow lint',
      'SHELLCHECK="$(node scripts/ci/security-tools.mjs shellcheck --print-path)" && ACTIONLINT="$(node scripts/ci/security-tools.mjs actionlint --print-path)" && "$ACTIONLINT" -shellcheck="$SHELLCHECK" .github/workflows/*.yml',
    ),
    stage('clean: format check', 'pnpm format:check'),
    stage('clean: lint', 'pnpm nx run-many -t lint --outputStyle=static'),
  ].join(' && ');

  run(
    'Run quality gate in a clean Node 22 Linux container',
    'docker',
    [
      'run',
      '--rm',
      '--volume',
      `${root}:/workspace`,
      '--mount',
      'type=volume,destination=/workspace/node_modules',
      '--mount',
      'type=volume,source=litmatch-local-ci-pnpm-store,destination=/pnpm/store',
      '--mount',
      'type=volume,destination=/workspace/.nx',
      '--workdir',
      '/workspace',
      '--env',
      'CI=true',
      '--env',
      'HUSKY=0',
      '--env',
      'NX_DAEMON=false',
      '--env',
      'NX_TUI=false',
      cleanRunnerImage,
      'bash',
      '-lc',
      command,
    ],
    { ownsInnerWatchdogs: true },
  );
}

function runTestAndBuild() {
  prepareDependencies();
  prepareNx();
  startTestServices();
  ensureLocalCiDatabase();
  run(
    'Frontend contract, tests, builds and bundle audit',
    pnpm,
    ['agent:verify', 'frontend'],
    { ownsInnerWatchdogs: true },
  );
  // This Redis lease suite intentionally uses the minimum production TTL to prove crash expiry
  // and live renewal. Running it beside the Core API's large Jest pool can starve its event-loop
  // refresh timer long enough to simulate a dead replica, so keep the timing-sensitive target
  // isolated and let the remaining pure/unit-heavy projects retain Nx parallelism.
  run('Signaling Redis integration tests with isolated CPU', pnpm, [
    'nx',
    'test',
    'signaling-gateway',
    '--coverage',
    '--skip-nx-cache',
    '--outputStyle=static',
  ]);
  run('Remaining unit and integration tests with coverage', pnpm, [
    'nx',
    'run-many',
    '-t',
    'test',
    '--coverage',
    '--exclude=admin,web,api-client,signaling-gateway',
    '--outputStyle=static',
  ]);
  run('Build backend projects', pnpm, [
    'nx',
    'run-many',
    '-t',
    'build',
    '--exclude=admin,web,api-client',
    '--outputStyle=static',
  ]);
  run('End-to-end smoke tests', pnpm, [
    'nx',
    'run-many',
    '-t',
    'e2e',
    '--parallel=2',
    '--outputStyle=static',
  ]);
}

function localCiDatabaseName() {
  const databaseUrl = new URL(environment.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(databaseName)) {
    throw new Error(
      'LOCAL_CI_DATABASE_URL phải có tên database PostgreSQL đơn giản để local runner tạo database cô lập.',
    );
  }
  return databaseName;
}

function ensureLocalCiDatabase() {
  if (process.env['LOCAL_CI_DATABASE_READY'] === 'true') {
    console.log('\n[ci-local] Reuse CI-provided isolated database');
    return;
  }

  const databaseName = localCiDatabaseName();
  if (dryRun) {
    console.log(`\n[ci-local] Ensure isolated database ${databaseName}`);
    return;
  }

  const check = spawnSync(
    'docker',
    [
      'exec',
      'litmatch-postgres',
      'psql',
      '--username',
      'litmatch',
      '--dbname',
      'postgres',
      '--tuples-only',
      '--no-align',
      '--command',
      `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
    ],
    {
      cwd: root,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
    },
  );
  if (check.status !== 0) {
    throw new Error(
      'Không kiểm tra được database local CI trong PostgreSQL container.',
    );
  }
  if (check.stdout.trim() === '1') return;

  run('Create isolated local CI database', 'docker', [
    'exec',
    'litmatch-postgres',
    'psql',
    '--username',
    'litmatch',
    '--dbname',
    'postgres',
    '--command',
    `CREATE DATABASE "${databaseName}"`,
  ]);
}

function imageTag() {
  if (dryRun) return 'local-dry-run';
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? `local-${result.stdout.trim()}` : 'local-latest';
}

function removeSmokeContainers() {
  run(
    'Remove previous local smoke containers',
    'docker',
    [
      'rm',
      '--force',
      'litmatch-core-smoke-local',
      'litmatch-signaling-smoke-local',
      'litmatch-web-smoke-local',
    ],
    { allowFailure: true },
  );
}

function waitForHealthEndpoints() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const coreReady = commandSucceeds('curl', [
      '--fail',
      '--silent',
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      'http://127.0.0.1:3000/health/ready',
    ]);
    const signalingReady = commandSucceeds('curl', [
      '--fail',
      '--silent',
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      'http://127.0.0.1:3001/health/ready',
    ]);
    const webReady = commandSucceeds('curl', [
      '--fail',
      '--silent',
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      'http://127.0.0.1:4300/',
    ]);
    if (coreReady && signalingReady && webReady) return;
    if (!dryRun) spawnSync('sleep', ['1'], { stdio: 'ignore' });
  }

  run(
    'Core API smoke-container logs',
    'docker',
    ['logs', 'litmatch-core-smoke-local'],
    { allowFailure: true },
  );
  run(
    'Signaling smoke-container logs',
    'docker',
    ['logs', 'litmatch-signaling-smoke-local'],
    { allowFailure: true },
  );
  run(
    'Web smoke-container logs',
    'docker',
    ['logs', 'litmatch-web-smoke-local'],
    { allowFailure: true },
  );
  throw new Error(
    'Container health checks did not become ready within 30 seconds.',
  );
}

function runContainerSmoke() {
  if (process.platform !== 'linux') {
    throw new Error(
      'Container smoke dùng Docker host networking giống GitHub Actions; chạy lệnh này trên Linux/WSL.',
    );
  }

  prepareDependencies();
  nxPrepared = false;
  prepareNx();
  startTestServices();
  ensureLocalCiDatabase();
  run('Build all projects for Docker images', pnpm, [
    'nx',
    'run-many',
    '-t',
    'build',
    '--outputStyle=static',
  ]);
  run('Run database migrations in the isolated local CI database', pnpm, [
    'db:migrate',
  ]);

  const tag = imageTag();
  const coreImage = `litmatch/core-api:${tag}`;
  const signalingImage = `litmatch/signaling-gateway:${tag}`;
  const webImage = `litmatch/web:${tag}`;
  const edgeImage = `litmatch/edge:${tag}`;
  run('Build Core API image', 'docker', [
    'build',
    '--file',
    'apps/core-api/Dockerfile',
    '--tag',
    coreImage,
    '.',
  ]);
  run('Build Signaling Gateway image', 'docker', [
    'build',
    '--file',
    'apps/signaling-gateway/Dockerfile',
    '--tag',
    signalingImage,
    '.',
  ]);
  run('Build Web image', 'docker', [
    'build',
    '--file',
    'apps/web/Dockerfile',
    '--tag',
    webImage,
    '.',
  ]);
  run('Build Edge image', 'docker', [
    'build',
    '--file',
    'deploy/production/Dockerfile.edge',
    '--tag',
    edgeImage,
    '.',
  ]);

  removeSmokeContainers();
  try {
    run('Start Core API smoke container', 'docker', [
      'run',
      '--detach',
      '--name',
      'litmatch-core-smoke-local',
      '--network',
      'host',
      '--env',
      'NODE_ENV=production',
      '--env',
      `DATABASE_URL=${environment.DATABASE_URL}`,
      '--env',
      `REDIS_URL=${environment.REDIS_URL}`,
      '--env',
      `JWT_SECRET=${environment.JWT_SECRET}`,
      '--env',
      `AUTH_OTP_PEPPER=${environment.AUTH_OTP_PEPPER}`,
      '--env',
      'AUTH_PHONE_OTP_ENABLED=true',
      '--env',
      'VIDEO_UPLOAD_ENABLED=false',
      '--env',
      'NOTIFICATION_PUSH_PROVIDER=disabled',
      '--env',
      'ECONOMY_IAP_VERIFIER=disabled',
      '--env',
      'ECONOMY_APPLE_WEBHOOK_VERIFIER=store',
      '--env',
      'ECONOMY_GOOGLE_RTDN_VERIFIER=store',
      '--env',
      'ECONOMY_OUTBOX_RELAY_ENABLED=false',
      '--env',
      'ECONOMY_REFUND_POLL_ENABLED=false',
      '--env',
      'LIVEKIT_URL=wss://media.example.com',
      '--env',
      'LIVEKIT_API_URL=http://127.0.0.1:7880',
      '--env',
      'LIVEKIT_API_KEY=ci-livekit-key',
      '--env',
      'LIVEKIT_API_SECRET=ci-livekit-secret-0123456789abcdef',
      coreImage,
    ]);
    run('Start Signaling Gateway smoke container', 'docker', [
      'run',
      '--detach',
      '--name',
      'litmatch-signaling-smoke-local',
      '--network',
      'host',
      '--env',
      'NODE_ENV=production',
      '--env',
      `JWT_SECRET=${environment.JWT_SECRET}`,
      '--env',
      `REDIS_URL=${environment.REDIS_URL}`,
      signalingImage,
    ]);
    run('Start Web smoke container', 'docker', [
      'run',
      '--detach',
      '--name',
      'litmatch-web-smoke-local',
      '--network',
      'host',
      '--env',
      'PORT=4300',
      webImage,
    ]);
    run('Validate Edge configuration', 'docker', [
      'run',
      '--rm',
      '--env',
      'DOMAIN=example.com',
      '--env',
      'ACME_EMAIL=ci@example.com',
      '--entrypoint',
      'caddy',
      edgeImage,
      'validate',
      '--config',
      '/etc/caddy/Caddyfile',
    ]);
    waitForHealthEndpoints();
    console.log('\n[ci-local] Container runtime smoke: PASS');
  } finally {
    removeSmokeContainers();
  }
}

function provisionSecurityTool(toolName) {
  console.log(`\n[ci-local] Provision ${toolName}`);
  const result = spawnSync(
    process.execPath,
    [
      securityToolsScript,
      toolName,
      '--print-path',
      ...(dryRun ? ['--dry-run'] : []),
    ],
    {
      cwd: root,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${toolName} bootstrap failed with exit code ${result.status ?? 1}`,
    );
  }
  return result.stdout.trim();
}

function runWorkflowLint() {
  const shellcheck = provisionSecurityTool('shellcheck');
  const actionlint = provisionSecurityTool('actionlint');
  const workflowDirectory = join(root, '.github', 'workflows');
  const workflowFiles = readdirSync(workflowDirectory)
    .filter((fileName) => /\.ya?ml$/u.test(fileName))
    .sort()
    .map((fileName) => join(workflowDirectory, fileName));

  run('Validate every GitHub Actions workflow', actionlint, [
    `-shellcheck=${shellcheck}`,
    ...workflowFiles,
  ]);
}

function runProfile() {
  console.log(`[ci-local] Profile: ${profile}${dryRun ? ' (dry run)' : ''}`);

  if (profile === 'quick') {
    runQuality();
    return;
  }
  if (profile === 'clean') {
    runCleanQuality();
    return;
  }
  if (profile === 'ci') {
    runQuality();
    runTestAndBuild();
    return;
  }
  if (profile === 'docker') {
    runContainerSmoke();
    return;
  }
  if (profile === 'security') {
    console.log(
      '\n[ci-local] Security profile is disabled; skipping secret and vulnerability scans.',
    );
    return;
  }

  runCleanQuality();
  runTestAndBuild();
  runContainerSmoke();
}

try {
  runProfile();
  console.log(`\n[ci-local] ${profile}: PASS`);
} catch (error) {
  console.error(`\n[ci-local] ${profile}: FAIL`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
