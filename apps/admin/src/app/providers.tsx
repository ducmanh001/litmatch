import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

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
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
