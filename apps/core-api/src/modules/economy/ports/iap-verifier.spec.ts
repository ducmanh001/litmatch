import { StoreIapVerifier } from './iap-verifier';
import { IapProvider } from '../entities/iap.entities';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

function config(): ConfigService<CoreApiEnv, true> {
  const values: Partial<CoreApiEnv> = {
    ECONOMY_APPLE_SHARED_SECRET: 'secret',
    ECONOMY_STORE_HTTP_TIMEOUT_MS: 1_000,
  };
  return {
    getOrThrow: (key: keyof CoreApiEnv) => values[key],
  } as ConfigService<CoreApiEnv, true>;
}

describe('StoreIapVerifier Apple boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gắn deadline và trả đúng transaction của product', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 0,
        receipt: {
          in_app: [{ product_id: 'diamonds-100', transaction_id: 'tx-1' }],
        },
      }),
    } as Response);

    await expect(
      new StoreIapVerifier(config()).verify(
        IapProvider.Apple,
        { receiptData: 'receipt' },
        'diamonds-100',
      ),
    ).resolves.toEqual({ providerTransactionId: 'tx-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('Apple 5xx là lỗi dependency, không diễn giải thành receipt client sai', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(
      new StoreIapVerifier(config()).verify(
        IapProvider.Apple,
        { receiptData: 'receipt' },
        'diamonds-100',
      ),
    ).rejects.toThrow('Apple store API lỗi 503');
  });
});
