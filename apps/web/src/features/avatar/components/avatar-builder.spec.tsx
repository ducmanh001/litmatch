import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { AvatarBuilder } from './avatar-builder';
import { apiClient } from '../../../shared/api/client';
import { ConfirmSheet } from '../../../shared/ui/confirm-sheet';
import { ToastStack } from '../../../shared/ui/toast-stack';

function renderBuilder() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AvatarBuilder />
      <ToastStack />
      <ConfirmSheet />
    </QueryClientProvider>,
  );
}

const FREE_ITEM = {
  id: 'a0000000-0000-4000-8000-000000000001',
  slot: 'base',
  code: 'base-01',
  name: 'Nền sáng',
  imageUrl: 'https://cdn.example.com/base-01.png',
  zIndex: 0,
  priceDiamond: 0,
};
const PAID_ITEM = {
  id: 'a0000000-0000-4000-8000-000000000002',
  slot: 'base',
  code: 'base-02',
  name: 'Nền hoàng hôn',
  imageUrl: 'https://cdn.example.com/base-02.png',
  zIndex: 0,
  priceDiamond: 50,
};

function mockGet(options: { owned: Array<typeof FREE_ITEM> }) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/avatar/me') {
      return { data: { data: { userId: 'me', layers: [] } } } as never;
    }
    if (path === '/api/v1/avatar/catalog') {
      return { data: { data: [FREE_ITEM, PAID_ITEM] } } as never;
    }
    if (path === '/api/v1/avatar/me/items') {
      return { data: { data: options.owned } } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('AvatarBuilder', () => {
  afterEach(() => vi.restoreAllMocks());

  it('item free chưa sở hữu → claim rồi equip, không hỏi xác nhận', async () => {
    mockGet({ owned: [] });
    const postSpy = vi
      .spyOn(apiClient, 'POST')
      .mockResolvedValue({ data: undefined } as never);
    const putSpy = vi.spyOn(apiClient, 'PUT').mockResolvedValue({
      data: { data: { userId: 'me', layers: [FREE_ITEM] } },
    } as never);

    renderBuilder();
    await userEvent.click(
      await screen.findByRole('button', { name: /Nền sáng/ }),
    );

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/avatar/items/{assetId}/claim',
        { params: { path: { assetId: FREE_ITEM.id } } },
      ),
    );
    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/api/v1/avatar/me/equip', {
        body: { slot: 'base', avatarAssetId: FREE_ITEM.id },
      }),
    );
  });

  it('item trả phí → hỏi xác nhận rồi mua với Idempotency-Key, sau đó equip', async () => {
    mockGet({ owned: [] });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { replayed: false } },
    } as never);
    vi.spyOn(apiClient, 'PUT').mockResolvedValue({
      data: { data: { userId: 'me', layers: [PAID_ITEM] } },
    } as never);

    renderBuilder();
    await userEvent.click(
      await screen.findByRole('button', { name: /Nền hoàng hôn/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mua' }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/avatar/items/{assetId}/buy',
        expect.objectContaining({
          params: expect.objectContaining({
            path: { assetId: PAID_ITEM.id },
            header: expect.objectContaining({
              'Idempotency-Key': expect.any(String),
            }),
          }),
        }),
      ),
    );
  });

  it('item đã sở hữu → equip thẳng, không claim/mua lại', async () => {
    mockGet({ owned: [PAID_ITEM] });
    const postSpy = vi.spyOn(apiClient, 'POST');
    const putSpy = vi.spyOn(apiClient, 'PUT').mockResolvedValue({
      data: { data: { userId: 'me', layers: [PAID_ITEM] } },
    } as never);

    renderBuilder();
    await userEvent.click(
      await screen.findByRole('button', { name: /Nền hoàng hôn/ }),
    );

    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    expect(postSpy).not.toHaveBeenCalled();
  });
});
