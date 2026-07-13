import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { UsersPage } from './users-page';
import { apiClient, tokenStore } from '../../../shared/api/client';

import type { AdminUserDto } from '../api';

function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(payload))}.sig`;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

const user = (overrides: Partial<AdminUserDto> = {}): AdminUserDto => ({
  id: 'u1',
  nickname: 'alice',
  gender: 'unknown',
  avatarId: 'default-01',
  isGuest: false,
  status: 'active',
  role: 'user',
  ...overrides,
});

describe('UsersPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => tokenStore.setSession(null));
  });

  it('empty — hiện EmptyState', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], total: 0 } },
    } as never);
    renderPage();

    expect(
      await screen.findByText('Không có user nào khớp bộ lọc'),
    ).toBeVisible();
  });

  it('error — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — bấm Khoá gọi đúng endpoint ban', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [user()], total: 1 } },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: user({ status: 'banned' }) },
    } as never);

    renderPage();
    const banButton = await screen.findByRole('button', { name: 'Khoá' });
    await act(async () => fireEvent.click(banButton));

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/users/{id}/ban', {
      params: { path: { id: 'u1' } },
    });
  });

  it('user banned — hiện nút Mở khoá thay vì Khoá', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [user({ status: 'banned' })], total: 1 } },
    } as never);
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Mở khoá' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Khoá' })).toBeNull();
  });

  it('không cho tự ban chính mình — nút Khoá disabled ở đúng dòng của mình', async () => {
    tokenStore.setSession({
      accessToken: fakeJwt({ sub: 'u1', isGuest: false, role: 'admin' }),
      csrfToken: 'r',
    });
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [user({ id: 'u1' })], total: 1 } },
    } as never);
    renderPage();

    const banButton = await screen.findByRole('button', { name: 'Khoá' });
    expect(banButton).toBeDisabled();
  });
});
