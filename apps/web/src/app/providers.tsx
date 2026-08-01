'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ProductAnalyticsIdentity } from '../shared/analytics/product-analytics-components';
import { resetProductAnalyticsUser } from '../shared/analytics/product-analytics';
import { WebVitals } from '../shared/analytics/web-vitals';
import { tokenStore } from '../shared/api/client';
import {
  shouldRefetchOnReconnect,
  shouldRetryQuery,
} from '../shared/api/query-retry-policy';
import { initializeBrowserSentry } from '../shared/monitoring/sentry';

import type { ReactNode } from 'react';

/** Default server-state khai đúng 1 lần (docs/13 § 13.4); per-query override phải có lý do. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
        // Keep browser online recovery for public routes and sessions whose socket did not
        // reconnect. AppChrome still resynchronizes durable state after a socket reconnect.
        refetchOnReconnect: shouldRefetchOnReconnect,
        // High-frequency session fallbacks are for the active tab only.
        refetchIntervalInBackground: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => initializeBrowserSentry(), []);
  useEffect(
    () =>
      tokenStore.subscribe(() => {
        if (tokenStore.getStatus() === 'unauthenticated') {
          queryClient.clear();
          resetProductAnalyticsUser();
        }
      }),
    [queryClient],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ProductAnalyticsIdentity />
      <WebVitals />
      {children}
    </QueryClientProvider>
  );
}
