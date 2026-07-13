#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const tools = {
  actionlint: {
    version: '1.7.12',
    sha256: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    archive: 'actionlint_1.7.12_linux_amd64.tar.gz',
    url: 'https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz',
    binary: 'actionlint',
  },
  gitleaks: {
    version: '8.30.1',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    archive: 'gitleaks_8.30.1_linux_x64.tar.gz',
    url: 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz',
    binary: 'gitleaks',
  },
  shellcheck: {
    version: '0.11.0',
    sha256: 'b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6',
    archive: 'shellcheck-v0.11.0.linux.x86_64.tar.gz',
    url: 'https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.gz',
    binary: 'shellcheck',
    archiveMember: 'shellcheck-v0.11.0/shellcheck',
    stripComponents: 1,
  },
  trivy: {
    version: '0.72.0',
    sha256: 'bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea',
    archive: 'trivy_0.72.0_Linux-64bit.tar.gz',
    url: 'https://github.com/aquasecurity/trivy/releases/download/v0.72.0/trivy_0.72.0_Linux-64bit.tar.gz',
    binary: 'trivy',
  },
};

const [toolName, ...argumentsList] = process.argv.slice(2);
const options = new Set(argumentsList);
const directoryIndex = argumentsList.indexOf('--install-dir');
const installBase =
  directoryIndex >= 0
    ? argumentsList[directoryIndex + 1]
    : join(
        process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'),
        'litmatch-ci-tools',
      );
const dryRun = options.has('--dry-run');
const printPath = options.has('--print-path');
const addToGithubPath = options.has('--add-to-github-path');
const tool = tools[toolName];

function fail(message) {
  console.error(`[security-tools] ${message}`);
  process.exit(1);
}

if (!tool) {
  fail(
    `Tool không hợp lệ: ${toolName ?? '(thiếu)'}. Hỗ trợ: ${Object.keys(tools).join(', ')}`,
  );
}
if (directoryIndex >= 0 && !installBase) {
  fail('Thiếu giá trị sau --install-dir.');
}
if (process.platform !== 'linux') {
  fail(
    'Security tool bootstrap hiện hỗ trợ Linux, khớp với GitHub Actions runner.',
  );
}

const installDirectory = join(installBase, `${toolName}-${tool.version}`);
const binaryPath = join(installDirectory, tool.binary);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}`);
  }
}

function install() {
  if (existsSync(binaryPath)) return;
  if (dryRun) {
    console.error(
      `[security-tools] Would install ${toolName} ${tool.version} in ${installDirectory}`,
    );
    return;
  }

  mkdirSync(installBase, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), `litmatch-${toolName}-`),
  );
  const archivePath = join(temporaryDirectory, tool.archive);
  const stagedDirectory = join(temporaryDirectory, 'install');

  try {
    console.error(`[security-tools] Downloading ${toolName} ${tool.version}`);
    run('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--output',
      archivePath,
      tool.url,
    ]);
    const actualSha256 = createHash('sha256')
      .update(readFileSync(archivePath))
      .digest('hex');
    if (actualSha256 !== tool.sha256) {
      throw new Error(`${toolName} checksum không khớp; huỷ cài đặt.`);
    }

    mkdirSync(stagedDirectory, { recursive: true });
    run('tar', [
      '-xzf',
      archivePath,
      '-C',
      stagedDirectory,
      ...(tool.stripComponents
        ? ['--strip-components', String(tool.stripComponents)]
        : []),
      tool.archiveMember ?? tool.binary,
    ]);
    chmodSync(join(stagedDirectory, tool.binary), 0o755);
    rmSync(installDirectory, { recursive: true, force: true });
    renameSync(stagedDirectory, installDirectory);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  install();
  if (addToGithubPath) {
    const githubPath = process.env['GITHUB_PATH'];
    if (!githubPath)
      fail(
        'GITHUB_PATH không tồn tại; chỉ dùng --add-to-github-path trong GitHub Actions.',
      );
    appendFileSync(githubPath, `${dirname(binaryPath)}\n`);
  }
  if (printPath) process.stdout.write(`${binaryPath}\n`);
  else console.error(`[security-tools] ${toolName} ready: ${binaryPath}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
