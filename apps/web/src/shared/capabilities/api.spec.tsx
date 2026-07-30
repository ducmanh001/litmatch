import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { apiClient } from '../api/client';
import { isCapabilityUsable, useCapabilities } from './api';

import type { PropsWithChildren } from 'react';

describe('runtime capabilities', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches the public capability contract once as server state', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { auth: {} } },
    } as never);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCapabilities(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('/api/v1/capabilities');
  });

  it('only enabled and beta capabilities are actionable', () => {
    expect(isCapabilityUsable({ status: 'enabled', message: '' })).toBe(true);
    expect(isCapabilityUsable({ status: 'beta', message: '' })).toBe(true);
    expect(isCapabilityUsable({ status: 'maintenance', message: '' })).toBe(
      false,
    );
    expect(isCapabilityUsable({ status: 'disabled', message: '' })).toBe(false);
  });
});
