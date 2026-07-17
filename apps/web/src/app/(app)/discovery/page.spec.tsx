import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import DiscoveryPage from './page';
import { apiClient } from '../../../shared/api/client';

import type { DiscoveryCardDto } from '../../../features/discovery/api';

function cardFixture(
  overrides: Partial<DiscoveryCardDto> = {},
): DiscoveryCardDto {
  return {
    profile: {
      id: 'user-1',
      nickname: 'Chi',
      gender: 'female',
      avatarId: 'default',
    },
    ageBucket: '20-24',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscoveryPage />
    </QueryClientProvider>,
  );
}

describe('DiscoveryPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rỗng — gợi ý chưa có ai phù hợp', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Khám phá phù hợp' }),
    );

    expect(await screen.findByText(/Chưa có ai phù hợp lúc này/)).toBeVisible();
  });

  it('có card — bấm vào mở sheet, mời Voice Match gọi đúng API', async () => {
    const card = cardFixture();
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [card], nextCursor: null } },
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          id: 'invite-1',
          inviterUserId: 'me',
          inviteeUserId: 'user-1',
          matchType: 'voice',
          status: 'pending',
          expiresAt: new Date().toISOString(),
          sessionId: null,
          createdAt: new Date().toISOString(),
        },
      },
    } as never);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Khám phá phù hợp' }));
    await user.click(await screen.findByText('Chi'));
    await user.click(screen.getByRole('button', { name: 'Mời Voice Match' }));

    expect(post).toHaveBeenCalledWith(
      '/api/v1/matching/invites',
      expect.objectContaining({
        body: { inviteeUserId: 'user-1', matchType: 'voice' },
      }),
    );
    expect(await screen.findByText(/Đã gửi lời mời Voice Match/)).toBeVisible();
  });

  it('lọc giới tính và khoảng tuổi bằng tham số API thật', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Khám phá phù hợp' }));
    await screen.findByText(/Chưa có ai phù hợp lúc này/);
    await user.click(screen.getByRole('button', { name: 'Nữ' }));
    await user.click(screen.getByRole('button', { name: '25–30' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/api/v1/discovery/browse',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              gender: 'female',
              ageMin: 25,
              ageMax: 30,
            }),
          },
        }),
      ),
    );
  });

  it('mở Quanh đây — probe server rồi mới yêu cầu opt-in nếu chưa bật', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(403, {
        code: 'DISCOVERY_NEARBY_NOT_OPTED_IN',
        message: 'Bạn cần bật Quanh đây',
        traceId: 'trace-nearby',
      }),
    );
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Bật tìm quanh đây' }),
    ).toBeVisible();
    expect(screen.getByText(/không thấy tọa độ/)).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      '/api/v1/discovery/nearby',
      expect.objectContaining({ params: expect.any(Object) }),
    );
  });

  it('người đã bật Quanh đây không bị hỏi lại quyền vị trí khi quay lại', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderPage();

    expect(await screen.findByText(/Chưa có ai phù hợp lúc này/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Bật tìm quanh đây' }),
    ).not.toBeInTheDocument();
  });

  it('cho phép tắt Quanh đây và yêu cầu server xoá vị trí', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    const put = vi.spyOn(apiClient, 'PUT').mockResolvedValue({} as never);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Tắt Quanh đây và xoá vị trí',
      }),
    );

    expect(put).toHaveBeenCalledWith('/api/v1/discovery/nearby/visible', {
      body: { visible: false },
    });
  });
});
