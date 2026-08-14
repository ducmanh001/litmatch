import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = 'scripts/ci/run-stage.mjs';

function runStage(timeoutMs, source, softTimeoutMs) {
  const environment = {
    ...process.env,
    LITMATCH_STAGE_LABEL: 'stage-runner-test',
    LITMATCH_STAGE_TIMEOUT_MS: String(timeoutMs),
    LITMATCH_STAGE_KILL_GRACE_MS: '100',
  };
  if (softTimeoutMs === undefined) {
    delete environment.LITMATCH_STAGE_SOFT_TIMEOUT_MS;
  } else {
    environment.LITMATCH_STAGE_SOFT_TIMEOUT_MS = String(softTimeoutMs);
  }

  return spawnSync(
    process.execPath,
    [runner, process.execPath, '--input-type=module', '--eval', source],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
      // The child deadline is intentionally longer than the production smoke values below.
      // Node startup can be delayed by a clean Linux container bind-mounting a Windows
      // workspace; the test must verify exit classification, not fail because the host is busy.
      timeout: Math.max(timeoutMs + 5000, 15000),
    },
  );
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }

  if (process.platform !== 'linux') return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const state = stat.slice(stat.lastIndexOf(')') + 2).charAt(0);
    return state !== 'Z';
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

test('stage runner preserves a real child failure before the deadline', () => {
  const result = runStage(10000, 'process.exit(7)');

  assert.equal(result.status, 7, result.stderr);
  assert.doesNotMatch(result.stderr, /TIMED_OUT/u);
});

test('stage runner does not describe a real child exit 124 as a timeout', () => {
  const result = runStage(10000, 'process.exit(124)');

  assert.equal(result.status, 124, result.stderr);
  assert.doesNotMatch(result.stderr, /TIMED_OUT/u);
});

test('stage runner warns on a slow child without killing it at the soft deadline', () => {
  const result = runStage(10000, 'setTimeout(() => process.exit(0), 300)', 100);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /SLOW_STAGE after 100ms/u);
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
  assert.equal(isProcessRunning(descendantPid), false);
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
  assert.equal(isProcessRunning(descendantPid), false);
});
