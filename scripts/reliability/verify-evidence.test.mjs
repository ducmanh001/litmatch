import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = new URL('./verify-evidence.mjs', import.meta.url);

function evidence(overrides = {}) {
  return {
    environment: 'staging',
    status: 'pass',
    gitSha: 'a'.repeat(40),
    executedAt: new Date().toISOString(),
    runUrl: 'https://evidence.invalid/runs/1',
    owner: 'platform-primary',
    ...overrides,
  };
}

function runGate(overridesByFile = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'litmatch-reliability-'));
  const checksByFile = {
    'loadtest.json': ['signaling-quota', 'multi-pod-reconnect', 'staging-load'],
    'game-day.json': [
      'redis-failure',
      'signaling-pod-kill',
      'core-api-failure',
      'livekit-failure',
      'payment-failure',
      'alert-delivery',
    ],
    'slo-dashboard.json': [
      'login',
      'matching',
      'messaging',
      'call-setup',
      'party-room',
      'payment',
    ],
  };
  for (const [name, checks] of Object.entries(checksByFile)) {
    writeFileSync(
      join(directory, name),
      JSON.stringify(evidence({ checks, ...overridesByFile[name] })),
    );
  }
  return spawnSync(process.execPath, [fileURLToPath(script)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RELIABILITY_EVIDENCE_DIR: directory,
      RELIABILITY_EXPECTED_GIT_SHA: 'a'.repeat(40),
      RELIABILITY_EXPECTED_ENVIRONMENT: 'staging',
    },
  });
}

test('production gate accepts fresh immutable evidence from all three sources', () => {
  const result = runGate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reliability production gate: PASS/u);
});

test('production gate rejects failed or stale evidence', () => {
  const stale = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const result = runGate({
    'loadtest.json': { status: 'fail', executedAt: stale },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /loadtest\.json/u);
  assert.match(result.stderr, /status must be pass/u);
  assert.match(result.stderr, /within 30 days/u);
});

test('production gate rejects a fresh passing artifact from a different release', () => {
  const result = runGate({ 'game-day.json': { gitSha: 'b'.repeat(40) } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /gitSha must match the expected release SHA/u);
});

test('production gate does not combine staging and production artifacts', () => {
  const result = runGate({
    'slo-dashboard.json': { environment: 'production' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /environment must match/u);
});

test('production gate rejects non-array checks instead of accepting substring matches', () => {
  const result = runGate({
    'loadtest.json': {
      checks: 'signaling-quota multi-pod-reconnect staging-load',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checks must be an array/u);
});

test('production gate rejects malformed evidence links and blank owners', () => {
  const result = runGate({
    'loadtest.json': { runUrl: 'not-a-link', owner: ' ' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runUrl must be an HTTPS link/u);
  assert.match(result.stderr, /owner must name/u);
});
