import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { GiftsPage } from './gifts-page';
import { apiClient } from '../../../shared/api/client';

import type { AdminGiftDto } from '../api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GiftsPage />
    </QueryClientProvider>,
  );
}

const gift = (overrides: Partial<AdminGiftDto> = {}): AdminGiftDto => ({
  id: 'g1',
  code: 'rose',
  name: 'Hoa hồng',
  priceDiamond: 1,
  active: true,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('GiftsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — hiện EmptyState', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [] },
    } as never);
    renderPage();

    expect(
      await screen.findByText('Chưa có quà nào trong catalog'),
    ).toBeVisible();
  });

  it('error — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — bấm Tắt gọi đúng endpoint update với active=false', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [gift()] },
    } as never);
    const patchSpy = vi
      .spyOn(apiClient, 'PATCH')
      .mockResolvedValue({ data: { data: gift({ active: false }) } } as never);

    renderPage();
    const toggleButton = await screen.findByRole('button', { name: 'Tắt' });
    await act(async () => fireEvent.click(toggleButton));

    expect(patchSpy).toHaveBeenCalledWith('/api/v1/admin/gifts/{id}', {
      params: { path: { id: 'g1' } },
      body: { active: false },
    });
  });

  it('data — sửa giá rồi Lưu gọi đúng endpoint update với priceDiamond mới', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [gift()] },
    } as never);
    const patchSpy = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({
      data: { data: gift({ priceDiamond: 50 }) },
    } as never);

    renderPage();
    const priceInput = await screen.findByDisplayValue('1');
    fireEvent.change(priceInput, { target: { value: '50' } });
    const saveButton = screen.getByRole('button', { name: 'Lưu' });
    await act(async () => fireEvent.click(saveButton));

    expect(patchSpy).toHaveBeenCalledWith('/api/v1/admin/gifts/{id}', {
      params: { path: { id: 'g1' } },
      body: { priceDiamond: 50 },
    });
  });

  it('tạo quà mới — submit form gọi đúng endpoint create', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [] },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: gift({ id: 'g2', code: 'new-gift' }) },
    } as never);

    renderPage();
    fireEvent.change(await screen.findByLabelText('Mã (code)'), {
      target: { value: 'new-gift' },
    });
    fireEvent.change(screen.getByLabelText('Tên'), {
      target: { value: 'Quà mới' },
    });
    fireEvent.change(screen.getByLabelText('Giá (diamond)'), {
      target: { value: '20' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Tạo quà' })),
    );

    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/gifts', {
      body: { code: 'new-gift', name: 'Quà mới', priceDiamond: 20 },
    });
  });
});
