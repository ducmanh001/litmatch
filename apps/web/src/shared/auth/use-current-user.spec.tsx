import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useCurrentUser } from './use-current-user';
import { apiClient, tokenStore } from '../api/client';

import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCurrentUser', () => {
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('không gọi API khi chưa đăng nhập', () => {
    const getSpy = vi.spyOn(apiClient, 'GET');
    renderHook(() => useCurrentUser(), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('gọi GET /users/me khi đã đăng nhập', async () => {
    tokenStore.setSession({ accessToken: 'a', refreshToken: 'r' });
    const getSpy = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { id: 'u1', nickname: 'A', gender: 'unknown' } },
    } as never);

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        id: 'u1',
        nickname: 'A',
        gender: 'unknown',
      }),
    );
    expect(getSpy).toHaveBeenCalledWith('/api/v1/users/me');
  });
});
