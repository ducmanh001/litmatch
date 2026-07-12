import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { AuthGate } from './auth-gate';
import { apiClient, tokenStore } from '../api/client';

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

describe('AuthGate', () => {
  afterEach(() => {
    tokenStore.setSession(null);
    routerReplace.mockClear();
    vi.restoreAllMocks();
  });

  it('redirect về login khi không có phiên có thể restore', async () => {
    render(
      <AuthGate>
        <p>private</p>
      </AuthGate>,
    );

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });

  it('restore access token trước khi render protected UI', async () => {
    window.localStorage.setItem('litmatch-web.refresh-token', 'refresh');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'litmatch-web.refresh-token',
          newValue: 'refresh',
          storageArea: window.localStorage,
        }),
      );
    });
    const restore = vi
      .spyOn(apiClient, 'restoreSession')
      .mockResolvedValue(true);

    render(
      <AuthGate>
        <p>private</p>
      </AuthGate>,
    );

    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });
});
