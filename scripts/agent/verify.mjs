#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scope = process.argv[2];
const tierArgument = process.argv.find((argument) =>
  argument.startsWith('--tier='),
);
const tier = tierArgument?.slice('--tier='.length) ?? 'full';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const scopes = {
  frontend: {
    projects: ['admin', 'web', 'api-client'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    browserBundleAudit: true,
  },
  core: {
    projects: ['core-api'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    integration: true,
    e2eProject: 'core-api-e2e',
  },
  economy: {
    projects: ['core-api'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    integration: true,
  },
  matching: {
    projects: ['core-api'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    integration: true,
  },
  calling: {
    projects: ['core-api'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    integration: true,
  },
  content: {
    projects: ['core-api'],
    requiredTargets: ['lint', 'test', 'build'],
    openapi: true,
    integration: true,
  },
  signaling: {
    projects: ['signaling-gateway'],
    requiredTargets: ['lint', 'test', 'build'],
    integration: true,
    e2eProject: 'signaling-gateway-e2e',
  },
  media: {
    projects: [],
    requiredTargets: [],
    mediaCompose: true,
  },
  infra: {
    projects: [],
    requiredTargets: [],
    doctor: true,
  },
};

if (!(scope in scopes)) {
  console.error(
    `Scope verify không hợp lệ: ${scope ?? '(thiếu)'}. Hỗ trợ: ${Object.keys(scopes).join(', ')}`,
  );
  process.exit(1);
}
if (!['fast', 'full'].includes(tier)) {
  console.error(`Tier không hợp lệ: ${tier}. Hỗ trợ: fast, full`);
  process.exit(1);
}

function runCommand(command, args, environment = {}) {
  console.log(`\n[agent-verify] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function run(args, environment) {
  runCommand(pnpm, args, environment);
}

function output(args) {
  return execFileSync(pnpm, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function filesUnder(relativeDirectory) {
  const directory = join(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const relative = join(relativeDirectory, name);
    if (statSync(absolute).isDirectory()) files.push(...filesUnder(relative));
    else files.push(relative);
  }
  return files;
}

const config = scopes[scope];

for (const project of config.projects) {
  const rawProjectConfig = output(['nx', 'show', 'project', project, '--json']);
  const jsonStart = rawProjectConfig.indexOf('{');
  if (jsonStart < 0) {
    console.error(`[agent-verify] Không đọc được Nx config của ${project}`);
    process.exit(1);
  }
  const projectConfig = JSON.parse(rawProjectConfig.slice(jsonStart));
  const missing = config.requiredTargets.filter(
    (target) => !(target in (projectConfig.targets ?? {})),
  );
  if (missing.length > 0) {
    console.error(
      `[agent-verify] ${project} thiếu target bắt buộc: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
}

run(['agent:check']);
run(['agent:test']);
if (config.openapi) run(['openapi:check']);
if (config.doctor) run(['doctor']);
if (config.mediaCompose) {
  runCommand('docker', [
    'compose',
    '-f',
    'apps/media-server/docker-compose.yml',
    'config',
    '--quiet',
  ]);
}

if (tier === 'full') run(['format:check']);
if (config.projects.length > 0) {
  const cacheArguments = tier === 'full' ? ['--skip-nx-cache'] : [];
  run([
    'nx',
    'run-many',
    '-t',
    'lint',
    '-p',
    ...config.projects,
    ...cacheArguments,
  ]);
  run(
    [
      'nx',
      'run-many',
      '-t',
      'test',
      '-p',
      ...config.projects,
      ...cacheArguments,
    ],
    config.integration
      ? {
          INTEGRATION_DB_URL:
            process.env.INTEGRATION_DB_URL ??
            'postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test',
        }
      : undefined,
  );
  if (tier === 'full') {
    run([
      'nx',
      'run-many',
      '-t',
      'build',
      '-p',
      ...config.projects,
      '--skip-nx-cache',
    ]);
  }
}
if (tier === 'full' && config.e2eProject) {
  run(['nx', 'e2e', config.e2eProject, '--skip-nx-cache']);
}

if (tier === 'full' && config.browserBundleAudit) {
  const browserBundles = [
    ...filesUnder('dist/apps/admin/assets'),
    ...filesUnder('apps/web/.next/static'),
  ].filter((path) => /\.(css|js)$/u.test(path));
  const forbiddenBundleText = ['class-validator', '@nestjs/'];
  const bundleViolations = [];
  if (browserBundles.length === 0) {
    bundleViolations.push('không tìm thấy JS/CSS output để audit');
  }
  for (const path of browserBundles) {
    const content = readFileSync(join(root, path), 'utf8');
    for (const pattern of forbiddenBundleText) {
      if (content.includes(pattern))
        bundleViolations.push(`${path}: ${pattern}`);
    }
    if (/\.css$/u.test(path) && /@tailwind\b|@theme\b/u.test(content)) {
      bundleViolations.push(`${path}: Tailwind directive chưa được compile`);
    }
  }

  const adminIndex = join(root, 'dist/apps/admin/index.html');
  if (!existsSync(adminIndex)) {
    bundleViolations.push('thiếu dist/apps/admin/index.html sau build');
  } else {
    const html = readFileSync(adminIndex, 'utf8');
    const entrySource = html.match(/<script[^>]+src="([^"]+\.js)"/u)?.[1];
    if (!entrySource) {
      bundleViolations.push(
        'không tìm thấy entry script trong admin index.html',
      );
    } else {
      const entryPath = join(
        root,
        'dist/apps/admin',
        entrySource.replace(/^\/+/, ''),
      );
      const gzipBytes = gzipSync(readFileSync(entryPath)).byteLength;
      const gzipBudgetBytes = 180 * 1024;
      console.log(
        `[agent-verify] Admin entry gzip: ${(gzipBytes / 1024).toFixed(2)} KiB / 180 KiB`,
      );
      if (gzipBytes > gzipBudgetBytes) {
        bundleViolations.push(
          `${entrySource}: gzip ${(gzipBytes / 1024).toFixed(2)} KiB vượt budget 180 KiB`,
        );
      }
    }
  }
  if (bundleViolations.length > 0) {
    console.error('[agent-verify] Browser bundle audit FAILED:');
    for (const violation of bundleViolations) console.error(`- ${violation}`);
    process.exit(1);
  }
}

console.log(`\n[agent-verify] ${scope} (${tier}): PASS`);
