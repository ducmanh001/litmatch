#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  createRuntimeEnv,
  parseEnvFile,
  validateReleaseConfig,
} from './release-config.mjs';

const root = resolve(import.meta.dirname, '../..');
const composeFile = resolve(root, 'deploy/production/compose.yml');
const stateFile = resolve(root, 'deploy/production/.release-state.json');
const backupDir = resolve(root, 'deploy/production/backups');
const action = process.argv[2] ?? 'preflight';
const envFile = resolve(
  process.cwd(),
  process.argv[3] ?? 'deploy/production/.env',
);

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`[release] ${command} (args: ${args.length}, redacted)`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: runtimeEnv,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0)
    fail(`${command} thất bại (${result.status ?? 'signal'})`);
  return result;
}

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...values },
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} thất bại`);
  return result.stdout.trim();
}

if (!existsSync(envFile)) {
  fail(
    `Không tìm thấy ${envFile}; copy deploy/production/.env.example thành .env trước.`,
  );
}
const values = parseEnvFile(envFile);
const errors = validateReleaseConfig(values);
if (errors.length > 0) fail(`Env chưa hợp lệ:\n- ${errors.join('\n- ')}`);

for (const [command, args] of [
  ['node', ['--version']],
  ['pnpm', ['--version']],
  ['docker', ['--version']],
  ['docker', ['compose', 'version']],
]) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  if (result.status !== 0) fail(`Thiếu command: ${command} ${args.join(' ')}`);
}

const gitTag = output('git', ['rev-parse', '--short=12', 'HEAD']);
let releaseTag = process.env.RELEASE_TAG ?? gitTag;
if (!/^[A-Za-z0-9._-]+$/u.test(releaseTag)) fail('RELEASE_TAG không hợp lệ');
let runtimeEnv = createRuntimeEnv(values, releaseTag);

function compose(...args) {
  const profile = values.GRAFANA_CLOUD_API_TOKEN
    ? ['--profile', 'monitoring']
    : [];
  return run('docker', [
    'compose',
    '--env-file',
    envFile,
    '-f',
    composeFile,
    ...profile,
    ...args,
  ]);
}

function preflight() {
  compose('config', '--quiet');
  console.log('[release] Preflight PASS: env, command và Compose hợp lệ.');
}

function build() {
  const publicBuildEnv = {
    ...runtimeEnv,
    NEXT_PUBLIC_API_URL: `https://api.${values.DOMAIN}`,
    NEXT_PUBLIC_SOCKET_URL: `https://realtime.${values.DOMAIN}`,
    NEXT_PUBLIC_LIVEKIT_URL: `wss://media.${values.DOMAIN}`,
    NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID: values.GOOGLE_OAUTH_CLIENT_ID,
    NEXT_PUBLIC_AUTH_APPLE_CLIENT_ID: '',
    NEXT_PUBLIC_PHONE_OTP_ENABLED: 'true',
    VITE_API_URL: `https://api.${values.DOMAIN}`,
    VITE_AUTH_GOOGLE_CLIENT_ID: values.GOOGLE_OAUTH_CLIENT_ID,
    VITE_PHONE_OTP_ENABLED: 'true',
  };
  runtimeEnv = publicBuildEnv;
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', [
    'nx',
    'run-many',
    '-t',
    'build',
    '-p',
    'core-api',
    'signaling-gateway',
    'web',
    'admin',
    '--skip-nx-cache',
  ]);
  run('docker', [
    'build',
    '-f',
    'apps/core-api/Dockerfile',
    '-t',
    publicBuildEnv.CORE_IMAGE,
    '.',
  ]);
  run('docker', [
    'build',
    '-f',
    'apps/signaling-gateway/Dockerfile',
    '-t',
    publicBuildEnv.SIGNALING_IMAGE,
    '.',
  ]);
  run('docker', [
    'build',
    '-f',
    'apps/web/Dockerfile',
    '-t',
    publicBuildEnv.WEB_IMAGE,
    '.',
  ]);
  run('docker', [
    'build',
    '-f',
    'deploy/production/Dockerfile.edge',
    '-t',
    publicBuildEnv.EDGE_IMAGE,
    '.',
  ]);
}

function backup() {
  mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const path = resolve(backupDir, `${timestamp}.dump`);
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '--format=custom',
      '--username',
      values.POSTGRES_USER,
      values.POSTGRES_DB,
    ],
    { cwd: root, env: runtimeEnv, maxBuffer: 1024 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    fail('Backup PostgreSQL thất bại; dừng trước migration.');
  }
  writeFileSync(path, result.stdout);
  console.log(`[release] Backup: ${path}`);
}

function migrate() {
  const hostDatabaseUrl = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@127.0.0.1:${values.POSTGRES_HOST_PORT ?? '5432'}/${encodeURIComponent(values.POSTGRES_DB)}`;
  runtimeEnv = { ...runtimeEnv, DATABASE_URL: hostDatabaseUrl };
  run('pnpm', ['db:migrate']);
  runtimeEnv = createRuntimeEnv(values, releaseTag);
}

function smoke() {
  const urls = [
    `https://api.${values.DOMAIN}/health/ready`,
    `https://realtime.${values.DOMAIN}/health/ready`,
    `https://app.${values.DOMAIN}/`,
    `https://admin.${values.DOMAIN}/login`,
  ];
  for (const url of urls)
    run('curl', ['--fail', '--silent', '--show-error', url]);
  console.log(
    '[release] Smoke PASS: API, realtime, web và admin đều reachable qua TLS.',
  );
}

function writeState() {
  const previous = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8')).current
    : null;
  writeFileSync(
    stateFile,
    `${JSON.stringify({ current: releaseTag, previous }, null, 2)}\n`,
  );
}

function deploy() {
  const dirty = output('git', [
    'status',
    '--porcelain',
    '--untracked-files=no',
  ]);
  if (dirty !== '')
    fail('Worktree có thay đổi tracked; không deploy artifact không truy vết.');
  preflight();
  build();
  compose('up', '-d', '--wait', 'postgres', 'redis', 'kafka');
  backup();
  migrate();
  compose('up', '-d', '--remove-orphans');
  smoke();
  writeState();
  console.log(`[release] Deploy PASS: ${releaseTag}`);
}

function rollback() {
  if (!existsSync(stateFile)) fail('Chưa có .release-state.json để rollback');
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (!state.previous) fail('Không có release trước đó để rollback');
  releaseTag = state.previous;
  runtimeEnv = createRuntimeEnv(values, releaseTag);
  preflight();
  compose('up', '-d', 'core-api', 'signaling-gateway', 'web', 'edge');
  smoke();
  writeFileSync(
    stateFile,
    `${JSON.stringify({ current: releaseTag, previous: state.current }, null, 2)}\n`,
  );
  console.log(`[release] Rollback PASS: ${releaseTag}`);
}

const actions = { preflight, build, backup, smoke, deploy, rollback };
const handler = actions[action];
if (handler === undefined) {
  fail(
    `Action không hợp lệ: ${action}. Dùng preflight|build|backup|smoke|deploy|rollback.`,
  );
}
handler();
