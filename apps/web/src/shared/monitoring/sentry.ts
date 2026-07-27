import * as Sentry from '@sentry/browser';

import { env } from '../env';

let initialized = false;

/** Browser faults are error events only; distributed traces remain in the OTel pipeline. */
export function initializeBrowserSentry(): void {
  if (initialized || env.NEXT_PUBLIC_SENTRY_DSN === undefined) return;
  initialized = true;
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    release: env.NEXT_PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export function captureBrowserException(exception: unknown): void {
  if (env.NEXT_PUBLIC_SENTRY_DSN !== undefined) {
    Sentry.captureException(exception);
  }
}
