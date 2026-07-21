'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  ProductAnalyticsConsentBanner,
  ProductAnalyticsIdentity,
} from '../shared/analytics/product-analytics-components';
import { resetProductAnalyticsUser } from '../shared/analytics/product-analytics';
import { tokenStore } from '../shared/api/client';

import type { ReactNode } from 'react';

/** Default server-state khai đúng 1 lần (docs/13 § 13.4); per-query override phải có lý do. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
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
      {children}
      <ProductAnalyticsConsentBanner />
    </QueryClientProvider>
  );
}
