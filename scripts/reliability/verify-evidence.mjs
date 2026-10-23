import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const evidenceDir = process.env['RELIABILITY_EVIDENCE_DIR'];
if (!evidenceDir) {
  throw new Error(
    'RELIABILITY_EVIDENCE_DIR is required (directory containing loadtest.json, game-day.json and slo-dashboard.json)',
  );
}

const expectedSha =
  process.env['RELIABILITY_EXPECTED_GIT_SHA'] ??
  process.env['GITHUB_SHA'] ??
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/i.test(expectedSha))
  throw new Error('Expected release SHA must be a full 40-character git SHA');
let expectedEnvironment = process.env['RELIABILITY_EXPECTED_ENVIRONMENT'];
if (
  expectedEnvironment &&
  !['staging', 'production'].includes(expectedEnvironment)
) {
  throw new Error(
    'RELIABILITY_EXPECTED_ENVIRONMENT must be staging or production',
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
  expectedEnvironment ??= evidence.environment;
  if (evidence.environment !== expectedEnvironment)
    problems.push(
      'environment must match the other evidence and expected environment',
    );
  if (evidence.status !== 'pass') problems.push('status must be pass');
  if (evidence.gitSha !== expectedSha)
    problems.push('gitSha must match the expected release SHA');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeDays * 86_400_000)
    problems.push(`executedAt must be within ${maxAgeDays} days`);
  try {
    const url = new URL(evidence.runUrl);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('invalid evidence link');
  } catch {
    problems.push(
      'runUrl must be an HTTPS link to immutable raw evidence without credentials',
    );
  }
  if (typeof evidence.owner !== 'string' || !evidence.owner.trim())
    problems.push('owner must name the accountable DRI');
  const artifactChecks = Array.isArray(evidence.checks) ? evidence.checks : [];
  if (
    !Array.isArray(evidence.checks) ||
    !artifactChecks.every((check) => typeof check === 'string')
  )
    problems.push('checks must be an array of check names');
  for (const check of checks) {
    if (!artifactChecks.includes(check))
      problems.push(`checks must include ${check}`);
  }

  if (problems.length > 0) {
    throw new Error(`${name}: ${problems.join('; ')}`);
  }
}

console.info('Reliability production gate: PASS');
