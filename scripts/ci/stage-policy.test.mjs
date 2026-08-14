import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStagePolicy } from './stage-policy.mjs';

test('stage policy gives short agent tasks a soft warning and a safe hard ceiling', () => {
  const policy = resolveStagePolicy('clean: agent tests');

  assert.equal(policy.profile, 'agent');
  assert.equal(policy.normalMs, 60_000);
  assert.equal(policy.softTimeoutMs, 180_000);
  assert.equal(policy.hardTimeoutMs, 900_000);
});

test('stage policy gives backend coverage a wider hard ceiling', () => {
  const policy = resolveStagePolicy(
    'Remaining unit and integration tests with coverage',
  );

  assert.equal(policy.profile, 'unit-integration-test');
  assert.equal(policy.softTimeoutMs, 1_800_000);
  assert.equal(policy.hardTimeoutMs, 3_600_000);
});

test('stage policy keeps scoped verification aligned with the workload', () => {
  const backend = resolveStagePolicy('agent-verify matching: pnpm nx test');
  const signaling = resolveStagePolicy('agent-verify signaling: pnpm nx test');

  assert.equal(backend.profile, 'backend');
  assert.equal(backend.hardTimeoutMs, 3_600_000);
  assert.equal(signaling.profile, 'signaling');
  assert.equal(signaling.softTimeoutMs, 540_000);
  assert.equal(signaling.hardTimeoutMs, 1_440_000);
});

test('stage policy gives parallel aggregate profiles a bounded one-hour ceiling', () => {
  const policy = resolveStagePolicy('Parallel test profile');

  assert.equal(policy.profile, 'aggregate');
  assert.equal(policy.softTimeoutMs, 1_800_000);
  assert.equal(policy.hardTimeoutMs, 3_600_000);
});

test('stage policy respects explicit hard and soft overrides', () => {
  const policy = resolveStagePolicy('custom stage', {
    hardTimeoutMs: 120_000,
    softTimeoutMs: 60_000,
  });

  assert.equal(policy.softTimeoutMs, 60_000);
  assert.equal(policy.hardTimeoutMs, 120_000);
});
