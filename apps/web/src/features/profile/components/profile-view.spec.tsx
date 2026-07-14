import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ProfileView } from './profile-view';
import { apiClient, tokenStore } from '../../../shared/api/client';

import type { MyProfileDto } from '../../../shared/auth/use-current-user';

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileView />
    </QueryClientProvider>,
  );
}

describe('ProfileView', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });

  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('error — hiển thị message từ envelope', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — render form với giá trị hiện tại', async () => {
    const profile: MyProfileDto = {
      id: 'u1',
      nickname: 'Mưa Đêm',
      gender: 'female',
      birthDate: '2000-01-31',
      region: 'VN',
      avatarId: 'a1',
      isGuest: false,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: profile },
    } as never);
    renderView();

    expect(await screen.findByLabelText('Biệt danh')).toHaveValue('Mưa Đêm');
    expect(screen.getByLabelText('Ngày sinh')).toHaveValue('2000-01-31');
    expect(screen.queryByText(/Tài khoản khách/)).not.toBeInTheDocument();
  });

  it('guest — hiện cảnh báo giới hạn tính năng', async () => {
    const profile: MyProfileDto = {
      id: 'u2',
      nickname: 'Khách',
      gender: 'unknown',
      birthDate: null,
      region: null,
      avatarId: 'a1',
      isGuest: true,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: profile },
    } as never);
    renderView();

    expect(await screen.findByText(/Tài khoản khách/)).toBeVisible();
  });
});
