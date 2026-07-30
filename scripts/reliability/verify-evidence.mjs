import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidenceDir = process.env['RELIABILITY_EVIDENCE_DIR'];
if (!evidenceDir) {
  throw new Error(
    'RELIABILITY_EVIDENCE_DIR is required (directory containing loadtest.json, game-day.json and slo-dashboard.json)',
  );
}

const required = [
  {
    name: 'loadtest.json',
    maxAgeDays: 30,
    checks: ['signaling-quota', 'multi-pod-reconnect', 'staging-load'],
  },
  {
    name: 'game-day.json',
    maxAgeDays: 90,
    checks: [
      'redis-failure',
      'signaling-pod-kill',
      'core-api-failure',
      'livekit-failure',
      'payment-failure',
      'alert-delivery',
    ],
  },
  {
    name: 'slo-dashboard.json',
    maxAgeDays: 30,
    checks: [
      'login',
      'matching',
      'messaging',
      'call-setup',
      'party-room',
      'payment',
    ],
  },
];
const now = Date.now();

for (const { name, maxAgeDays, checks } of required) {
  const path = resolve(evidenceDir, name);
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  const ageMs = now - Date.parse(evidence.executedAt);
  const problems = [];

  if (!['staging', 'production'].includes(evidence.environment))
    problems.push('environment must be staging or production');
  if (evidence.status !== 'pass') problems.push('status must be pass');
  if (!/^[0-9a-f]{7,40}$/i.test(evidence.gitSha ?? ''))
    problems.push('gitSha must identify the tested build');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeDays * 86_400_000)
    problems.push(`executedAt must be within ${maxAgeDays} days`);
  if (!evidence.runUrl)
    problems.push('runUrl must link immutable raw evidence');
  if (!evidence.owner) problems.push('owner must name the accountable DRI');
  for (const check of checks) {
    if (!evidence.checks?.includes(check))
      problems.push(`checks must include ${check}`);
  }

  if (problems.length > 0) {
    throw new Error(`${name}: ${problems.join('; ')}`);
  }
}

console.info('Reliability production gate: PASS');
