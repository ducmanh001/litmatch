import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ModerationPage } from './moderation-page';
import { apiClient } from '../../../shared/api/client';

import type { AdminReportDto } from '../api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ModerationPage />
    </QueryClientProvider>,
  );
}

const report = (overrides: Partial<AdminReportDto> = {}): AdminReportDto => ({
  id: 'r1',
  reporterUserId: 'reporter-1',
  targetUserId: 'target-1',
  reason: 'spam',
  description: null,
  trustPenaltyApplied: 5,
  status: 'pending',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('ModerationPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — hiện EmptyState', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], total: 0 } },
    } as never);
    renderPage();

    expect(
      await screen.findByText('Không có report nào khớp bộ lọc'),
    ).toBeVisible();
  });

  it('error — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — bấm "Đã xử lý" gọi đúng endpoint resolve', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [report()], total: 1 } },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: report({ status: 'resolved' }) },
    } as never);

    renderPage();
    const resolveButton = await screen.findByRole('button', {
      name: 'Đã xử lý',
    });
    await act(async () => fireEvent.click(resolveButton));

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/reports/{id}/resolve', {
      params: { path: { id: 'r1' } },
    });
  });

  it('data — bấm "Bỏ qua" gọi đúng endpoint dismiss', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [report()], total: 1 } },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: report({ status: 'dismissed' }) },
    } as never);

    renderPage();
    const dismissButton = await screen.findByRole('button', { name: 'Bỏ qua' });
    await act(async () => fireEvent.click(dismissButton));

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/reports/{id}/dismiss', {
      params: { path: { id: 'r1' } },
    });
  });

  it('report đã resolved — không hiện nút hành động', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [report({ status: 'resolved' })], total: 1 } },
    } as never);
    renderPage();

    await screen.findByText('Đã xử lý');
    expect(screen.queryByRole('button', { name: 'Đã xử lý' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bỏ qua' })).toBeNull();
  });

  it('tab Video ngắn chờ duyệt — Duyệt gọi đúng endpoint approve', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/videos/pending') {
        return {
          data: {
            data: {
              items: [
                {
                  id: 'v1',
                  authorUserId: 'author-1',
                  status: 'pending_review',
                  playbackUrl: null,
                  thumbnailUrl: null,
                  caption: 'video test',
                  createdAt: new Date().toISOString(),
                },
              ],
              nextCursor: null,
            },
          },
        } as never;
      }
      return { data: { data: { items: [], total: 0 } } } as never;
    });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: {} },
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Video chờ duyệt' }));

    const approveButton = await screen.findByRole('button', { name: 'Duyệt' });
    await act(async () => fireEvent.click(approveButton));

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/videos/{id}/approve', {
      params: { path: { id: 'v1' } },
    });
  });

  it('tab Video đã đăng — Gỡ khỏi feed gọi đúng endpoint remove', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/videos/published') {
        return {
          data: {
            data: {
              items: [
                {
                  id: 'v2',
                  authorUserId: 'author-2',
                  status: 'published',
                  playbackUrl: 'https://cdn.test/video.mp4',
                  thumbnailUrl: null,
                  caption: 'published video',
                  createdAt: new Date().toISOString(),
                },
              ],
              nextCursor: null,
            },
          },
        } as never;
      }
      return { data: { data: { items: [], total: 0 } } } as never;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: {} },
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Video đã đăng' }));
    const removeButton = await screen.findByRole('button', {
      name: 'Gỡ khỏi feed',
    });
    await act(async () => fireEvent.click(removeButton));

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/videos/{id}/remove', {
      params: { path: { id: 'v2' } },
    });
  });

  it('tab Hỗ trợ — cập nhật ticket sang resolved kèm phản hồi', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/support/tickets') {
        return {
          data: {
            data: {
              items: [
                {
                  id: 'ticket-1',
                  userId: 'user-1',
                  category: 'bug',
                  message: 'Không mở được phòng',
                  status: 'open',
                  staffResponse: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              meta: { nextCursor: null },
            },
          },
        } as never;
      }
      return { data: { data: { items: [], total: 0 } } } as never;
    });
    const patchSpy = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({
      data: { data: {} },
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Hỗ trợ' }));
    expect(await screen.findByText('Không mở được phòng')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Phản hồi ticket ticket-1'), {
      target: { value: 'Đã sửa lỗi' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Đã giải quyết' })),
    );

    expect(patchSpy).toHaveBeenCalledWith(
      '/api/v1/admin/support/tickets/{id}',
      {
        params: { path: { id: 'ticket-1' } },
        body: { status: 'resolved', staffResponse: 'Đã sửa lỗi' },
      },
    );
  });
});
