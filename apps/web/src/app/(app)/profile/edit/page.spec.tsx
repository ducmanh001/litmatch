import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import EditProfilePage from './page';
import { apiClient, tokenStore } from '../../../../shared/api/client';

import type { MyProfileDto } from '../../../../shared/auth/use-current-user';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditProfilePage />
    </QueryClientProvider>,
  );
}

describe('EditProfilePage', () => {
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
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị form với giá trị hiện tại, nút Lưu ở header submit form', async () => {
    const profile: MyProfileDto = {
      id: 'u1',
      nickname: 'Mưa Đêm',
      gender: 'female',
      birthDate: '2000-01-31',
      region: 'VN',
      avatarId: 'a1',
      isGuest: false,
      interests: ['Du lịch'],
      seekingGender: 'any',
      seekingAgeMin: 22,
      seekingAgeMax: 30,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: profile },
    } as never);
    const patch = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({
      data: { data: profile },
    } as never);

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByDisplayValue('Mưa Đêm')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Quay lại hồ sơ' }),
    ).toHaveAttribute('href', '/profile');
    const avatarButtons = screen.getAllByRole('button', {
      name: 'Đổi ảnh đại diện',
    });
    expect(avatarButtons).toHaveLength(2);
    avatarButtons.forEach((button) => expect(button).toBeEnabled());

    // "Nam" xuất hiện ở cả nhóm Giới tính lẫn "Giới tính quan tâm" — scope theo group
    const genderGroup = screen.getByRole('group', { name: 'Giới tính' });
    await user.click(within(genderGroup).getByRole('button', { name: 'Nam' }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(patch).toHaveBeenCalledWith(
      '/api/v1/users/me',
      expect.objectContaining({
        body: expect.objectContaining({
          nickname: 'Mưa Đêm',
          gender: 'male',
          interests: ['Du lịch'],
          seekingGender: 'any',
          seekingAgeMin: 22,
          seekingAgeMax: 30,
        }),
      }),
    );
  });
});
