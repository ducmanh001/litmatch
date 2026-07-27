import * as Sentry from '@sentry/browser';

import { env } from '../env';

/** Keep Sentry error-only so admin does not duplicate the application's OTel trace pipeline. */
export function initializeBrowserSentry(): void {
  if (env.VITE_SENTRY_DSN === undefined) return;
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT,
    release: env.VITE_SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
