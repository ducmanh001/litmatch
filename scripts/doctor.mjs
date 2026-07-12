#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';

const root = new URL('../', import.meta.url);
let failures = 0;

function result(ok, label, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[${mark}] ${label}${suffix}`);
  if (!ok) failures += 1;
}

function info(label, detail) {
  console.log(`[INFO] ${label} — ${detail}`);
}

function warn(label, detail) {
  console.log(`[WARN] ${label} — ${detail}`);
}

function command(file, args = []) {
  try {
    return execFileSync(file, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function envKeys(path) {
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('='))),
  );
}

function checkPort(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const expectedNodeMajor = Number(
  readFileSync(new URL('.nvmrc', root), 'utf8').trim().split('.')[0],
);
const actualNodeMajor = Number(process.versions.node.split('.')[0]);
result(
  actualNodeMajor === expectedNodeMajor,
  'Node.js version',
  `expected ${expectedNodeMajor}.x, got ${process.versions.node}`,
);

const packageJson = JSON.parse(
  readFileSync(new URL('package.json', root), 'utf8'),
);
const expectedPnpm = packageJson.packageManager.replace('pnpm@', '');
const actualPnpm = command('pnpm', ['--version']);
result(
  actualPnpm === expectedPnpm,
  'pnpm version',
  `expected ${expectedPnpm}, got ${actualPnpm ?? 'missing'}`,
);

result(
  command('docker', ['version', '--format', '{{.Server.Version}}']) !== null,
  'Docker daemon',
);
result(
  command('docker', ['compose', 'version', '--short']) !== null,
  'Docker Compose',
);

const envPath = new URL('.env', root);
const examplePath = new URL('.env.example', root);
result(
  existsSync(envPath),
  '.env file',
  existsSync(envPath) ? 'present' : 'run: cp .env.example .env',
);
if (existsSync(envPath)) {
  const missing = [...envKeys(examplePath)].filter(
    (key) => !envKeys(envPath).has(key),
  );
  if (missing.length > 0) {
    warn(
      '.env keys',
      `${missing.length} optional/defaulted key(s) are absent; compare with .env.example`,
    );
  } else {
    result(true, '.env keys', 'matches .env.example');
  }
}

const remote = command('git', ['remote', 'get-url', 'origin']);
let cleanRemote = true;
if (remote) {
  try {
    const url = new URL(remote);
    cleanRemote = !url.username && !url.password;
  } catch {
    cleanRemote = true; // SCP-like SSH remotes do not contain URL userinfo credentials.
  }
}
result(
  cleanRemote,
  'Git remote credentials',
  cleanRemote ? 'URL is clean' : 'credential found in remote URL',
);

const services = [
  ['PostgreSQL', '127.0.0.1', 5432],
  ['Redis', '127.0.0.1', 6379],
  ['Kafka', '127.0.0.1', 9092],
];
for (const [name, host, port] of services) {
  const open = await checkPort(host, port);
  info(
    name,
    open
      ? `reachable on ${host}:${port}`
      : `not running on ${host}:${port} (run pnpm infra:up)`,
  );
}

if (failures > 0) {
  console.error(`\nDoctor found ${failures} blocking problem(s).`);
  process.exitCode = 1;
} else {
  console.log('\nDevelopment environment is ready.');
}
