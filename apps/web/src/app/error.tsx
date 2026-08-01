'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect } from 'react';

import { captureBrowserException } from '../shared/monitoring/sentry';
import { useTranslation } from '../shared/i18n/messages';

/** Error boundary cấp route (docs/13 § 13.7) — 1 màn vỡ không kéo sập cả app. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => captureBrowserException(error), [error]);
  const t = useTranslation();
  const apiError = isApiError(error) ? error : null;
  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center"
    >
      <h1 className="text-xl font-semibold">{t('status.errorTitle')}</h1>
      <p className="text-muted-foreground">
        {apiError?.message ?? t('status.unknownError')}
      </p>
      {apiError !== null && apiError.traceId !== '' && (
        <p className="font-mono text-xs text-muted-foreground">
          trace: {apiError.traceId}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t('status.retry')}
      </button>
    </main>
  );
}
