import { DisabledIapVerifier } from './iap-verifier';
import { StoreIapVerifierAdapter } from '../clients/store-iap-verifier.adapter';
import { AppleReceiptApiAdapter } from '../clients/apple-receipt-api.adapter';
import { EconomyErrors } from '../economy.errors';
import { IapProvider } from '../entities/iap.entities';
import type {
  AppleReceiptGateway,
  GooglePlayReceiptGateway,
} from './store-payment-gateways';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

function config(): ConfigService<CoreApiEnv, true> {
  const values: Partial<CoreApiEnv> = {
    ECONOMY_APPLE_SHARED_SECRET: 'secret',
    ECONOMY_GOOGLE_PACKAGE_NAME: 'com.litmatch.app',
    ECONOMY_STORE_HTTP_TIMEOUT_MS: 1_000,
  };
  return {
    getOrThrow: (key: keyof CoreApiEnv) => values[key],
  } as ConfigService<CoreApiEnv, true>;
}

describe('AppleReceiptApiAdapter contract', () => {
  afterEach(() => jest.restoreAllMocks());

  it('success: gắn deadline và trả đúng transaction của product', async () => {
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
      new AppleReceiptApiAdapter(config()).verify({
        receiptData: 'receipt',
        productId: 'diamonds-100',
      }),
    ).resolves.toEqual({ providerTransactionId: 'tx-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('invalid receipt: Apple status khác 0 là lỗi receipt rõ ràng', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 21010 }),
    } as Response);

    await expect(
      new AppleReceiptApiAdapter(config()).verify({
        receiptData: 'receipt',
        productId: 'diamonds-100',
      }),
    ).rejects.toMatchObject({ code: EconomyErrors.IAP_RECEIPT_INVALID });
  });

  it('timeout: lỗi upstream là provider unavailable, không giả thành invalid receipt', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new DOMException('The operation was aborted', 'TimeoutError'),
      );

    await expect(
      new AppleReceiptApiAdapter(config()).verify({
        receiptData: 'receipt',
        productId: 'diamonds-100',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('consumable retry: chọn transactionId cụ thể, không lấy giao dịch đầu tiên cùng product', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 0,
        receipt: {
          in_app: [
            { product_id: 'diamonds-100', transaction_id: 'tx-old' },
            { product_id: 'diamonds-100', transaction_id: 'tx-new' },
          ],
        },
      }),
    } as Response);

    await expect(
      new AppleReceiptApiAdapter(config()).verify({
        receiptData: 'receipt',
        productId: 'diamonds-100',
        transactionId: 'tx-new',
      }),
    ).resolves.toEqual({ providerTransactionId: 'tx-new' });
    await expect(
      new AppleReceiptApiAdapter(config()).verify({
        receiptData: 'receipt',
        productId: 'diamonds-100',
      }),
    ).rejects.toMatchObject({ code: EconomyErrors.IAP_RECEIPT_INVALID });
  });
});

describe('StoreIapVerifierAdapter contract', () => {
  it('routes Apple and Google payloads only through their gateways', async () => {
    const apple: jest.Mocked<AppleReceiptGateway> = {
      verify: jest.fn().mockResolvedValue({ providerTransactionId: 'a-1' }),
    };
    const google: jest.Mocked<GooglePlayReceiptGateway> = {
      verify: jest.fn().mockResolvedValue({ providerTransactionId: 'g-1' }),
    };
    const adapter = new StoreIapVerifierAdapter(apple, google);

    await expect(
      adapter.verify(
        IapProvider.Apple,
        { receiptData: 'r', transactionId: 'a-1' },
        'diamonds-100',
      ),
    ).resolves.toEqual({ providerTransactionId: 'a-1' });
    await expect(
      adapter.verify(
        IapProvider.Google,
        { purchaseToken: 'p' },
        'diamonds-100',
      ),
    ).resolves.toEqual({ providerTransactionId: 'g-1' });
    expect(apple.verify).toHaveBeenCalledWith({
      receiptData: 'r',
      productId: 'diamonds-100',
      transactionId: 'a-1',
    });
    expect(google.verify).toHaveBeenCalledWith('diamonds-100', 'p');
  });
});

describe('DisabledIapVerifier', () => {
  it('từ chối trước khi có thể tạo ledger side effect', async () => {
    await expect(
      new DisabledIapVerifier().verify(
        IapProvider.Google,
        { purchaseToken: 'must-not-be-used' },
        'diamonds-100',
      ),
    ).rejects.toMatchObject({ code: EconomyErrors.IAP_DISABLED });
  });
});
