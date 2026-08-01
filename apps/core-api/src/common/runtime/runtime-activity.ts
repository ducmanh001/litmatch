/**
 * Lightweight, process-local activity signal for the alpha runtime.
 *
 * Health/readiness probes must not wake background work: hosted platforms can call them even
 * when the product has no users. Business/API traffic does wake the non-critical backstops for
 * a short window. Event-driven work remains independent of this gate.
 */
export const RUNTIME_ACTIVITY_IDLE_AFTER_MS = 5 * 60 * 1_000;

let lastMeaningfulRequestAt: number | undefined;

export function markRuntimeActivity(path: string, now = Date.now()): void {
  if (isProbePath(path)) return;
  lastMeaningfulRequestAt = now;
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
