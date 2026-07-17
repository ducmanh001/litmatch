import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient } from '../../../shared/api/client';
import { confirmStore } from '../../../shared/lib/confirm-store';
import { SpeedupButton } from './speedup-button';

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SpeedupButton ticketId="ticket-1" priceDiamond={50} />
    </QueryClientProvider>,
  );
}

async function confirmSpeedup(): Promise<void> {
  await userEvent.click(
    screen.getByRole('button', { name: 'Ưu tiên · 50 diamond' }),
  );
  act(() => confirmStore.resolve(true));
}

describe('SpeedupButton', () => {
  afterEach(() => {
    confirmStore.resolve(false);
    vi.restoreAllMocks();
  });

  it('không gọi API tính phí trước khi người dùng xác nhận', async () => {
    const post = vi.spyOn(apiClient, 'POST');
    renderButton();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ưu tiên · 50 diamond' }),
    );

    expect(post).not.toHaveBeenCalled();
    expect(confirmStore.getSnapshot()?.options.title).toBe(
      'Dùng 50 diamond để ưu tiên?',
    );
    expect(confirmStore.getSnapshot()?.options.message).toContain(
      'trừ chính xác 50 diamond',
    );
  });

  it('sau xác nhận mới gọi đúng endpoint với idempotency key', async () => {
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: undefined },
    } as never);
    renderButton();

    await confirmSpeedup();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/matching/tickets/{id}/speedup',
        expect.objectContaining({
          params: {
            path: { id: 'ticket-1' },
            header: { 'Idempotency-Key': expect.any(String) },
          },
        }),
      ),
    );
  });

  it('lỗi rồi thử lại vẫn dùng cùng idempotency key, tránh trừ diamond hai lần', async () => {
    const post = vi
      .spyOn(apiClient, 'POST')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: { data: undefined } } as never);
    renderButton();

    await confirmSpeedup();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Có lỗi xảy ra, thử lại.',
    );

    await confirmSpeedup();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const firstKey = (
      post.mock.calls[0]?.[1] as {
        params: { header: { 'Idempotency-Key': string } };
      }
    ).params.header['Idempotency-Key'];
    const retryKey = (
      post.mock.calls[1]?.[1] as {
        params: { header: { 'Idempotency-Key': string } };
      }
    ).params.header['Idempotency-Key'];
    expect(retryKey).toBe(firstKey);
  });
});
