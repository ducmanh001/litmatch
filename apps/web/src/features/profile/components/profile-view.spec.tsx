import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ProfileView } from './profile-view';
import { apiClient, tokenStore } from '../../../shared/api/client';
import { setLocale } from '../../../shared/i18n/locale-store';

import type { MyProfileDto } from '../../../shared/auth/use-current-user';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

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
    setLocale('vi');
    vi.restoreAllMocks();
  });

  it('error — hiển thị message từ envelope', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị nickname và menu cài đặt', async () => {
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

    expect(await screen.findByText('Mưa Đêm')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Chỉnh sửa Avatar & hồ sơ/ }),
    ).toHaveAttribute('href', '/profile/edit');
    expect(
      screen.getByRole('button', { name: 'Đăng xuất' }),
    ).toBeInTheDocument();
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

  it('English — localizes profile copy and keeps English selectable in the profile menu', async () => {
    act(() => setLocale('en'));
    const profile: MyProfileDto = {
      id: 'u3',
      nickname: 'Sky',
      gender: 'unknown',
      birthDate: null,
      region: null,
      avatarId: 'a1',
      isGuest: false,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: profile },
    } as never);
    renderView();

    expect(await screen.findByText('Your profile')).toBeVisible();
    expect(screen.getByText('Language')).toBeVisible();
    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole('button', {
        name: /Choose language, English/,
      })[1],
    );
    expect(screen.getByRole('option', { name: 'English' })).toBeVisible();
  });
});
