import type { Meter } from '@opentelemetry/api';

/**
 * Lightweight, process-local activity signal for the alpha runtime.
 *
 * Health/readiness probes must not wake background work: hosted platforms can call them even
 * when the product has no users. Business/API traffic does wake the non-critical backstops for
 * a short window. Event-driven work remains independent of this gate.
 */
export const RUNTIME_ACTIVITY_IDLE_AFTER_MS = 5 * 60 * 1_000;

let lastMeaningfulRequestAt: number | undefined;
let meaningfulRequestCount = 0;
let backgroundSkipCount = 0;
const backgroundSkipsByJob = new Map<string, number>();

export function markRuntimeActivity(path: string, now = Date.now()): void {
  if (isProbePath(path)) return;
  lastMeaningfulRequestAt = now;
  meaningfulRequestCount += 1;
}

/** Record a skipped best-effort timer tick without creating any request or Redis traffic. */
export function recordRuntimeBackgroundSkip(jobName: string): void {
  backgroundSkipCount += 1;
  backgroundSkipsByJob.set(
    jobName,
    (backgroundSkipsByJob.get(jobName) ?? 0) + 1,
  );
}

export interface RuntimeActivitySnapshot {
  mode: 'idle' | 'active';
  lastMeaningfulRequestAt?: number;
  lastMeaningfulRequestAgeMs?: number;
  meaningfulRequestCount: number;
  backgroundSkipCount: number;
}

export function getRuntimeActivitySnapshot(
  now = Date.now(),
): RuntimeActivitySnapshot {
  const age =
    lastMeaningfulRequestAt === undefined
      ? undefined
      : Math.max(0, now - lastMeaningfulRequestAt);

  return {
    mode: isRuntimeActive(now) ? 'active' : 'idle',
    ...(lastMeaningfulRequestAt === undefined
      ? {}
      : { lastMeaningfulRequestAt }),
    ...(age === undefined ? {} : { lastMeaningfulRequestAgeMs: age }),
    meaningfulRequestCount,
    backgroundSkipCount,
  };
}

/** Register low-cardinality runtime gauges during app bootstrap. */
export function registerRuntimeActivityMetrics(
  meter: Meter,
  appName: string,
): void {
  const activeGauge = meter.createObservableGauge('runtime_active', {
    description: 'Whether recent business/API traffic keeps the runtime active',
    unit: '1',
  });
  activeGauge.addCallback((result) =>
    result.observe(isRuntimeActive() ? 1 : 0, { app: appName }),
  );

  const ageGauge = meter.createObservableGauge(
    'runtime_last_meaningful_request_age_seconds',
    {
      description: 'Age of the last non-probe request',
      unit: 's',
    },
  );
  ageGauge.addCallback((result) => {
    const age = getRuntimeActivitySnapshot().lastMeaningfulRequestAgeMs;
    result.observe(age === undefined ? 0 : age / 1_000, { app: appName });
  });

  const requestGauge = meter.createObservableGauge(
    'runtime_meaningful_requests',
    {
      description: 'Business/API requests that keep best-effort jobs warm',
      unit: '1',
    },
  );
  requestGauge.addCallback((result) =>
    result.observe(getRuntimeActivitySnapshot().meaningfulRequestCount, {
      app: appName,
    }),
  );

  const skipGauge = meter.createObservableGauge('runtime_background_skipped', {
    description: 'Best-effort background ticks skipped while runtime is idle',
    unit: '1',
  });
  skipGauge.addCallback((result) => {
    for (const [job, count] of backgroundSkipsByJob) {
      result.observe(count, { app: appName, job });
    }
  });
}

export function isRuntimeActive(
  now = Date.now(),
  idleAfterMs = RUNTIME_ACTIVITY_IDLE_AFTER_MS,
): boolean {
  return (
    lastMeaningfulRequestAt !== undefined &&
    now - lastMeaningfulRequestAt <= idleAfterMs
  );
}

/** Test-only reset; no production caller should need to reset process activity. */
export function resetRuntimeActivity(): void {
  lastMeaningfulRequestAt = undefined;
  meaningfulRequestCount = 0;
  backgroundSkipCount = 0;
  backgroundSkipsByJob.clear();
}

function isProbePath(path: string): boolean {
  const pathname = path.split('?', 1)[0] ?? path;
  return (
    pathname === '/health' ||
    pathname.startsWith('/health/') ||
    pathname.endsWith('/health') ||
    pathname.includes('/health/') ||
    pathname === '/metrics' ||
    pathname.endsWith('/metrics') ||
    pathname.startsWith('/swagger')
  );
}
