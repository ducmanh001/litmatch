import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = 'scripts/ci/local.mjs';

function dryRun(profile) {
  return spawnSync(process.execPath, [script, profile, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('quick local CI profile resets Nx and runs the quality gate', () => {
  const result = dryRun('quick');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reset Nx daemon and project-graph cache/u);
  assert.match(result.stdout, /Lint every Nx project/u);
});

test('clean local CI profile uses an empty node_modules volume in Node 22 Linux', () => {
  const result = dryRun('clean');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node:22-bookworm@sha256:/u);
  assert.equal(
    (result.stdout.match(/--mount type=\*\*\*REDACTED\*\*\*/gu) ?? []).length,
    3,
  );
  assert.match(result.stdout, /bash -lc/u);
  assert.match(result.stdout, /safe.directory \/workspace/u);
  assert.match(result.stdout, /--env HUSKY=\*\*\*REDACTED\*\*\*/u);
  assert.match(result.stdout, /--env NX_DAEMON=\*\*\*REDACTED\*\*\*/u);
  assert.match(result.stdout, /--env CI=\*\*\*REDACTED\*\*\*/u);
  assert.match(
    result.stdout,
    /pnpm install --store-dir \/pnpm\/store --frozen-lockfile/u,
  );
});

test('all local CI profile plans quality, security, test, and Docker smoke stages', () => {
  const result = dryRun('all');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scan Git history for secrets/u);
  assert.match(result.stdout, /--baseline-path .gitleaks-baseline\.json/u);
  assert.match(result.stdout, /--ignorefile .trivyignore\.yaml/u);
  assert.match(result.stdout, /Ensure isolated database litmatch_ci/u);
  assert.match(result.stdout, /End-to-end smoke tests/u);
  assert.match(result.stdout, /Build Core API image/u);
  assert.match(result.stdout, /Scan Core API runtime image/u);
  assert.match(result.stdout, /DATABASE_URL=\*\*\*REDACTED\*\*\*/u);
  assert.match(result.stdout, /REDIS_URL=\*\*\*REDACTED\*\*\*/u);
  assert.match(result.stdout, /JWT_SECRET=\*\*\*REDACTED\*\*\*/u);
  assert.match(result.stdout, /AUTH_OTP_PEPPER=\*\*\*REDACTED\*\*\*/u);
  assert.doesNotMatch(result.stdout, /local-ci-jwt-0123456789abcdef-xyz/u);
  assert.doesNotMatch(result.stdout, /local-ci-pepper-0123456789/u);
  assert.doesNotMatch(
    result.stdout,
    /litmatch_local@localhost:5432\/litmatch_ci/u,
  );
  assert.doesNotMatch(result.stdout, /redis:\/\/localhost:6379\/15/u);
});

test('local CI rejects an unsupported profile', () => {
  const result = dryRun('not-a-profile');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /profile không hợp lệ/u);
});
