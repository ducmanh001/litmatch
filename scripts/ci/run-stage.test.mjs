import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = 'scripts/ci/run-stage.mjs';

function runStage(timeoutMs, source) {
  return spawnSync(
    process.execPath,
    [runner, process.execPath, '--input-type=module', '--eval', source],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LITMATCH_STAGE_LABEL: 'stage-runner-test',
        LITMATCH_STAGE_TIMEOUT_MS: String(timeoutMs),
        LITMATCH_STAGE_KILL_GRACE_MS: '100',
      },
      timeout: 5000,
    },
  );
}

test('stage runner preserves a real child failure before the deadline', () => {
  const result = runStage(2000, 'process.exit(7)');

  assert.equal(result.status, 7, result.stderr);
  assert.doesNotMatch(result.stderr, /TIMED_OUT/u);
});

test('stage runner does not describe a real child exit 124 as a timeout', () => {
  const result = runStage(2000, 'process.exit(124)');

  assert.equal(result.status, 124, result.stderr);
  assert.doesNotMatch(result.stderr, /TIMED_OUT/u);
});

test('stage runner classifies a hung command and stops it', () => {
  const result = runStage(100, 'setInterval(() => {}, 1000)');

  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /TIMED_OUT after 100ms: stage-runner-test/u);
});

test('stage runner hard-kills descendants that ignore SIGTERM', () => {
  const result = runStage(
    100,
    [
      "import { spawn } from 'node:child_process'",
      "const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' })",
      'console.log(child.pid)',
      "process.on('SIGTERM', () => {})",
      'setInterval(() => {}, 1000)',
    ].join(';'),
  );

  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /HARD_KILL/u);
  const descendantPid = Number(result.stdout.trim());
  assert.ok(Number.isSafeInteger(descendantPid), result.stdout);
  assert.throws(
    () => process.kill(descendantPid, 0),
    (error) => error?.code === 'ESRCH',
  );
});

test('stage runner hard-kills a stubborn descendant after its parent exits', () => {
  const result = runStage(
    100,
    [
      "import { spawn } from 'node:child_process'",
      "const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' })",
      'console.log(child.pid)',
      'setInterval(() => {}, 1000)',
    ].join(';'),
  );

  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /HARD_KILL/u);
  const descendantPid = Number(result.stdout.trim());
  assert.ok(Number.isSafeInteger(descendantPid), result.stdout);
  assert.throws(
    () => process.kill(descendantPid, 0),
    (error) => error?.code === 'ESRCH',
  );
});
