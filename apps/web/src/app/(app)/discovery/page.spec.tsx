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

  it('mở màn hình bằng Khám phá phù hợp — không cần quyền vị trí', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderPage();

    expect(await screen.findByText(/Chưa có ai phù hợp lúc này/)).toBeVisible();
  });

  it('có card — bấm vào đi thẳng tới profile đầy đủ, không mở sheet trung gian', async () => {
    const card = cardFixture();
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [card], nextCursor: null } },
    } as never);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Khám phá phù hợp' }));
    const profileLink = await screen.findByRole('link', {
      name: 'Xem hồ sơ Chi, 20-24 tuổi',
    });

    expect(profileLink).toHaveAttribute('href', '/users/user-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Quanh đây' }));
    expect(
      await screen.findByRole('button', { name: 'Bật tìm quanh đây' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Khám phá hồ sơ không cần vị trí' }),
    ).toBeVisible();
    expect(screen.getByText(/không thấy tọa độ/)).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      '/api/v1/discovery/nearby',
      expect.objectContaining({ params: expect.any(Object) }),
    );
  });

  it('từ Nearby chưa bật có thể quay lại xem hồ sơ ngay không cần vị trí', async () => {
    const card = cardFixture({
      profile: {
        id: 'user-2',
        nickname: 'Lan',
        gender: 'female',
        avatarId: 'default',
      },
    });
    vi.spyOn(apiClient, 'GET').mockImplementation(((path: string) => {
      if (path === '/api/v1/discovery/nearby') {
        return Promise.reject(
          new ApiError(403, {
            code: 'DISCOVERY_NEARBY_NOT_OPTED_IN',
            message: 'Bạn cần bật Quanh đây',
            traceId: 'trace-nearby',
          }),
        );
      }
      return Promise.resolve({
        data: { data: { items: [card], nextCursor: null } },
      });
    }) as never);
    renderPage();

    await screen.findByText('Lan');
    await userEvent.click(screen.getByRole('button', { name: 'Quanh đây' }));
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Khám phá hồ sơ không cần vị trí',
      }),
    );

    expect(screen.getByText('Lan')).toBeVisible();
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

    await userEvent.click(screen.getByRole('button', { name: 'Quanh đây' }));
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
