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

    await screen.findByText('resolved');
    expect(screen.queryByRole('button', { name: 'Đã xử lý' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bỏ qua' })).toBeNull();
  });
});
