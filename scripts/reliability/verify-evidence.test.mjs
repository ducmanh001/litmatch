import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
  return spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8',
    env: { ...process.env, RELIABILITY_EVIDENCE_DIR: directory },
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
