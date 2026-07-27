import * as Sentry from '@sentry/node';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  serviceName: string;
}

/**
 * Error monitoring tách khỏi OTel tracing: Sentry chỉ nhận exception để tránh gửi trace hai lần.
 * Credential luôn là DSN runtime; để trống thì integration tắt hoàn toàn.
 */
export function initializeSentry(config: SentryConfig): void {
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
