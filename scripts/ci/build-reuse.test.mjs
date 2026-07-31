import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('full local preflight reuses the build outputs already validated by test/build', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/ci/local.mjs', 'all', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Reuse validated application build outputs for Docker images/u,
  );
  assert.doesNotMatch(result.stdout, /Build all projects for Docker images/u);
});

test('standalone Docker profile still builds application outputs before smoke', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/ci/local.mjs', 'docker', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Build all projects for Docker images/u);
});
