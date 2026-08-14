const MINUTE_MS = 60 * 1000;
const MIN_HARD_TIMEOUT_MS = 15 * MINUTE_MS;
const MAX_HARD_TIMEOUT_MS = 60 * MINUTE_MS;

const stageProfiles = [
  {
    name: 'aggregate',
    pattern: /parallel (?:clean|test) profile/iu,
    normalMs: 10 * MINUTE_MS,
  },
  {
    name: 'dependency-install',
    pattern: /install dependencies/iu,
    normalMs: 3 * MINUTE_MS,
  },
  { name: 'nx-reset', pattern: /reset Nx/iu, normalMs: 1 * MINUTE_MS },
  { name: 'frontend', pattern: /frontend/iu, normalMs: 10 * MINUTE_MS },
  { name: 'signaling', pattern: /signaling/iu, normalMs: 3 * MINUTE_MS },
  {
    name: 'backend',
    pattern: /agent-verify (?:core|economy|matching|calling|content)/iu,
    normalMs: 10 * MINUTE_MS,
  },
  {
    name: 'agent',
    pattern: /agent(?:-verify| contract| guard| tests)/iu,
    normalMs: 1 * MINUTE_MS,
  },
  {
    name: 'workflow-lint',
    pattern: /workflow lint|Validate every GitHub Actions workflow/iu,
    normalMs: 2 * MINUTE_MS,
  },
  { name: 'format', pattern: /format/iu, normalMs: 2 * MINUTE_MS },
  {
    name: 'unit-integration-test',
    pattern: /unit and integration|coverage/iu,
    normalMs: 10 * MINUTE_MS,
  },
  {
    name: 'docker',
    pattern: /docker|container|edge/iu,
    normalMs: 15 * MINUTE_MS,
  },
  { name: 'build', pattern: /build/iu, normalMs: 10 * MINUTE_MS },
  { name: 'e2e', pattern: /end-to-end|e2e/iu, normalMs: 10 * MINUTE_MS },
  {
    name: 'services',
    pattern: /postgres(?:ql)?|redis/iu,
    normalMs: 2 * MINUTE_MS,
  },
  {
    name: 'database',
    pattern: /database|migration/iu,
    normalMs: 2 * MINUTE_MS,
  },
];

const defaultProfile = {
  name: 'default',
  normalMs: 5 * MINUTE_MS,
};

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function profileFor(label) {
  return (
    stageProfiles.find((profile) => profile.pattern.test(String(label))) ??
    defaultProfile
  );
}

/**
 * Timeout policy for long-running local/CI stages.
 *
 * A soft timeout only reports that a stage is slower than expected. The hard timeout is the
 * last-resort ceiling that allows the runner to recover from a genuinely hung process.
 */
export function resolveStagePolicy(label, overrides = {}) {
  const profile = profileFor(label);
  const normalMs = profile.normalMs;
  const derivedSoftTimeoutMs = normalMs * 3;
  const derivedHardTimeoutMs = Math.min(
    Math.max(normalMs * 8, MIN_HARD_TIMEOUT_MS),
    MAX_HARD_TIMEOUT_MS,
  );
  const hardTimeoutMs = overrides.hardTimeoutMs ?? derivedHardTimeoutMs;
  const softTimeoutMs =
    overrides.softTimeoutMs ??
    Math.min(derivedSoftTimeoutMs, hardTimeoutMs - 1000);

  if (!isPositiveInteger(hardTimeoutMs)) {
    throw new Error(
      `Hard timeout không hợp lệ cho stage ${label}: ${hardTimeoutMs}`,
    );
  }
  if (!isPositiveInteger(softTimeoutMs) || softTimeoutMs >= hardTimeoutMs) {
    throw new Error(
      `Soft timeout không hợp lệ cho stage ${label}: soft=${softTimeoutMs}, hard=${hardTimeoutMs}`,
    );
  }

  return {
    profile: profile.name,
    normalMs,
    softTimeoutMs,
    hardTimeoutMs,
  };
}
