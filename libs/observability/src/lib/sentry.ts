import * as Sentry from '@sentry/node';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  serviceName: string;
}

/**
 * Error monitoring tách khỏi OTel tracing: Sentry chỉ nhận exception để tránh gửi trace hai lần.
 * Credential luôn là DSN runtime. Dev/CI có thể để trống; profile production-like đặt
 * OBSERVABILITY_REQUIRED=true và sẽ fail boot nếu DSN/release thiếu.
 */
export function initializeSentry(config: SentryConfig): void {
  if (
    process.env['OBSERVABILITY_REQUIRED'] === 'true' &&
    (config.dsn === '' || config.release === '')
  ) {
    throw new Error(
      'Production Sentry is required: configure both SENTRY_DSN and SENTRY_RELEASE',
    );
  }
  if (config.dsn === '') return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request !== undefined) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.headers;
      }
      return event;
    },
  });
  Sentry.setTag('service', config.serviceName);
}

/** Capture only application faults that reached the controlled exception boundary. */
export function captureSentryException(
  exception: unknown,
  traceId: string,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('trace_id', traceId);
    Sentry.captureException(exception);
  });
}
