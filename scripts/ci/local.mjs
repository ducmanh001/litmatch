#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const profile = process.argv[2] ?? 'ci';
const dryRun = process.argv.includes('--dry-run');
const cleanRunnerImage =
  process.env['LOCAL_CI_NODE_IMAGE'] ??
  'node:22-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365';
const securityToolsScript = fileURLToPath(
  new URL('./security-tools.mjs', import.meta.url),
);
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

  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment, ...(options.env ?? {}) },
    stdio: 'inherit',
  });

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
  run('Reset Nx daemon and project-graph cache', pnpm, ['nx', 'reset']);
  nxPrepared = true;
}

function startTestServices() {
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
  run('Lint every Nx project', pnpm, ['nx', 'run-many', '-t', 'lint']);
}

function runCleanQuality() {
  if (!dryRun) mkdirSync(join(root, '.nx'), { recursive: true });

  const command = [
    'git config --global --add safe.directory /workspace',
    'corepack enable',
    'pnpm install --store-dir /pnpm/store --frozen-lockfile',
    'pnpm nx reset',
    'pnpm agent:check',
    'pnpm agent:test',
    'SHELLCHECK="$(node scripts/ci/security-tools.mjs shellcheck --print-path)"',
    'ACTIONLINT="$(node scripts/ci/security-tools.mjs actionlint --print-path)"',
    '"$ACTIONLINT" -shellcheck="$SHELLCHECK" .github/workflows/*.yml',
    'pnpm format:check',
    'pnpm nx run-many -t lint',
  ].join(' && ');

  run('Run quality gate in a clean Node 22 Linux container', 'docker', [
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
    cleanRunnerImage,
    'bash',
    '-lc',
    command,
  ]);
}

function runTestAndBuild() {
  prepareDependencies();
  prepareNx();
  startTestServices();
  ensureLocalCiDatabase();
  run('Frontend contract, tests, builds and bundle audit', pnpm, [
    'agent:verify',
    'frontend',
  ]);
  run('Unit and integration tests with coverage', pnpm, [
    'nx',
    'run-many',
    '-t',
    'test',
    '--coverage',
    '--exclude=admin,web,api-client',
  ]);
  run('Build backend projects', pnpm, [
    'nx',
    'run-many',
    '-t',
    'build',
    '--exclude=admin,web,api-client',
  ]);
  run('End-to-end smoke tests', pnpm, [
    'nx',
    'run-many',
    '-t',
    'e2e',
    '--parallel=2',
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
    ],
    { allowFailure: true },
  );
}

function waitForHealthEndpoints() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const coreReady = commandSucceeds('curl', [
      '--fail',
      '--silent',
      'http://127.0.0.1:3000/health/ready',
    ]);
    const signalingReady = commandSucceeds('curl', [
      '--fail',
      '--silent',
      'http://127.0.0.1:3001/health/ready',
    ]);
    if (coreReady && signalingReady) return;
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
  ]);
  run('Run database migrations in the isolated local CI database', pnpm, [
    'db:migrate',
  ]);

  const tag = imageTag();
  const coreImage = `litmatch/core-api:${tag}`;
  const signalingImage = `litmatch/signaling-gateway:${tag}`;
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
  const trivy = provisionSecurityTool('trivy');
  const imageScanArgs = [
    'image',
    '--scanners',
    'vuln',
    '--severity',
    'HIGH,CRITICAL',
    '--ignore-unfixed',
    '--exit-code',
    '1',
    '--no-progress',
    '--skip-version-check',
  ];
  run('Scan Core API runtime image', trivy, [...imageScanArgs, coreImage]);
  run('Scan Signaling Gateway runtime image', trivy, [
    ...imageScanArgs,
    signalingImage,
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
      'NODE_ENV=test',
      '--env',
      `DATABASE_URL=${environment.DATABASE_URL}`,
      '--env',
      `REDIS_URL=${environment.REDIS_URL}`,
      '--env',
      `JWT_SECRET=${environment.JWT_SECRET}`,
      '--env',
      `AUTH_OTP_PEPPER=${environment.AUTH_OTP_PEPPER}`,
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
  run('Validate GitHub Actions workflows', actionlint, [
    `-shellcheck=${shellcheck}`,
    '.github/workflows/ci.yml',
    '.github/workflows/security.yml',
  ]);
}

function runSecurityChecks() {
  const gitleaks = provisionSecurityTool('gitleaks');
  const trivy = provisionSecurityTool('trivy');
  run('Scan Git history for secrets', gitleaks, [
    'git',
    '--redact',
    '--no-banner',
    '--verbose',
    '--baseline-path',
    '.gitleaks-baseline.json',
    '.',
  ]);
  prepareDependencies();
  run('Audit high and critical dependency vulnerabilities', pnpm, [
    'audit',
    '--audit-level',
    'high',
  ]);
  run('Scan filesystem vulnerabilities and misconfiguration', trivy, [
    'filesystem',
    '.',
    '--scanners',
    'vuln,misconfig',
    '--severity',
    'HIGH,CRITICAL',
    '--ignore-unfixed',
    '--exit-code',
    '1',
    '--no-progress',
    '--skip-version-check',
    '--ignorefile',
    '.trivyignore.yaml',
    '--skip-dirs',
    '.nx',
    '--skip-dirs',
    'dist',
  ]);
  console.log(
    '\n[ci-local] CodeQL uploads results to GitHub and remains a GitHub Actions-only check.',
  );
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
    runSecurityChecks();
    return;
  }

  runCleanQuality();
  runSecurityChecks();
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
