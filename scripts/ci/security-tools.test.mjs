import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = 'scripts/ci/security-tools.mjs';
const baselinePath = fileURLToPath(
  new URL('../../.gitleaks-baseline.json', import.meta.url),
);

function dryRun(tool) {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'litmatch-security-tools-'),
  );

  try {
    return spawnSync(
      process.execPath,
      [
        script,
        tool,
        '--install-dir',
        temporaryDirectory,
        '--dry-run',
        '--print-path',
      ],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('plans the checksum-verified Gitleaks installation', () => {
  const result = dryRun('gitleaks');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gitleaks-8\.30\.1\/gitleaks\n$/u);
  assert.match(result.stderr, /Would install gitleaks 8\.30\.1/u);
});

test('plans the checksum-verified actionlint installation', () => {
  const result = dryRun('actionlint');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /actionlint-1\.7\.12\/actionlint\n$/u);
  assert.match(result.stderr, /Would install actionlint 1\.7\.12/u);
});

test('plans the checksum-verified ShellCheck installation', () => {
  const result = dryRun('shellcheck');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shellcheck-0\.11\.0\/shellcheck\n$/u);
  assert.match(result.stderr, /Would install shellcheck 0\.11\.0/u);
});

test('plans the checksum-verified Trivy installation', () => {
  const result = dryRun('trivy');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /trivy-0\.72\.0\/trivy\n$/u);
  assert.match(result.stderr, /Would install trivy 0\.72\.0/u);
});

test('rejects an unsupported security tool', () => {
  const result = dryRun('unknown');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Tool không hợp lệ/u);
});

test('adds the installed directory to GitHub Actions PATH', () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'litmatch-github-path-'),
  );
  const githubPath = join(temporaryDirectory, 'github-path');

  try {
    const result = spawnSync(
      process.execPath,
      [script, 'trivy', '--dry-run', '--add-to-github-path'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_PATH: githubPath },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(githubPath, 'utf8'),
      `${process.env['XDG_CACHE_HOME'] ?? `${process.env['HOME']}/.cache`}/litmatch-ci-tools/trivy-0.72.0\n`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('keeps the Gitleaks baseline restricted to three redacted test findings', () => {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  assert.equal(baseline.length, 3);
  for (const finding of baseline) {
    assert.equal(finding.RuleID, 'generic-api-key');
    assert.equal(finding.Secret, 'REDACTED');
    assert.match(finding.File, /\.integration\.spec\.ts$/u);
    assert.match(finding.Fingerprint, /^[0-9a-f]{40}:.*:generic-api-key:\d+$/u);
  }
});
