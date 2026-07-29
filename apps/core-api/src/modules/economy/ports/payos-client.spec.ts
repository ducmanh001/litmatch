import { createHmac } from 'node:crypto';

import { PayosClient } from './payos-client';

describe('PayosClient', () => {
  const config = {
    getOrThrow: (key: string) =>
      ({
        PAYOS_CLIENT_ID: 'client-id',
        PAYOS_API_KEY: 'api-key',
        PAYOS_CHECKSUM_KEY: 'checksum-key',
        PAYOS_API_BASE_URL: 'https://api-merchant.payos.vn',
        PAYOS_HTTP_TIMEOUT_MS: 10_000,
      })[key],
  };

  afterEach(() => jest.restoreAllMocks());

  it('đặt signature HMAC chuẩn payOS trong JSON body, không lộ checksum qua header', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: '00',
          data: {
            paymentLinkId: 'plink-1',
            checkoutUrl: 'https://pay.example/checkout',
            qrCode: 'qr',
          },
        }),
        { status: 200 },
      ),
    );
    const client = new PayosClient(config as never);
    await client.createPaymentLink({
      orderCode: '1760000000000000',
      amountVnd: '50000',
      description: 'Litmatch 1760000000000000',
      returnUrl: 'https://web.example/wallet?paymentOrder=o1',
      cancelUrl: 'https://web.example/wallet?paymentOrder=o1',
      expiresAt: new Date('2026-07-29T00:15:00.000Z'),
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)['x-checksum'],
    ).toBeUndefined();
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.signature).toBe(
      createHmac('sha256', 'checksum-key')
        .update(
          'amount=50000&cancelUrl=https://web.example/wallet?paymentOrder=o1&description=Litmatch 1760000000000000&orderCode=1760000000000000&returnUrl=https://web.example/wallet?paymentOrder=o1',
        )
        .digest('hex'),
    );
  });

  it('từ chối webhook có signature sai trước khi service có thể query DB', () => {
    const client = new PayosClient(config as never);
    let caught: unknown;
    try {
      client.verifyWebhook({
        code: '00',
        success: true,
        data: {
          amount: 50000,
          code: '00',
          currency: 'VND',
          orderCode: 1760000000000000,
          paymentLinkId: 'plink-1',
        },
        signature: '00'.repeat(32),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({
      code: 'ECONOMY_WEBHOOK_SIGNATURE_INVALID',
    });
  });

  it('quyết định success từ data đã ký, không tin outer success/code', () => {
    const client = new PayosClient(config as never);
    const data = {
      amount: 50000,
      code: '00',
      currency: 'VND',
      orderCode: 1760000000000000,
      paymentLinkId: 'plink-1',
    };
    const canonical = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key as keyof typeof data]}`)
      .join('&');
    const signature = createHmac('sha256', 'checksum-key')
      .update(canonical)
      .digest('hex');

    expect(
      client.verifyWebhook({
        code: '01',
        success: false,
        data,
        signature,
      }),
    ).toMatchObject({ code: '00', success: true });
  });

  it.each([
    ['POST trả lỗi', new Response(null, { status: 409 })],
    ['POST timeout', new Error('timeout')],
  ])('phục hồi link theo orderCode nếu %s', async (_case, postResult) => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    if (postResult instanceof Error) {
      fetchSpy.mockRejectedValueOnce(postResult);
    } else {
      fetchSpy.mockResolvedValueOnce(postResult);
    }
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '00',
          data: {
            id: 'plink-recovered',
            orderCode: 1760000000000001,
            status: 'PENDING',
          },
        }),
        { status: 200 },
      ),
    );
    const client = new PayosClient(config as never);

    await expect(
      client.createPaymentLink({
        orderCode: '1760000000000001',
        amountVnd: '50000',
        description: 'Litmatch 1760000000000001',
        returnUrl: 'https://web.example/wallet',
        cancelUrl: 'https://web.example/wallet',
        expiresAt: new Date('2026-07-29T00:15:00.000Z'),
      }),
    ).resolves.toEqual({
      paymentLinkId: 'plink-recovered',
      checkoutUrl: 'https://pay.payos.vn/web/plink-recovered',
      qrCode: null,
    });
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://api-merchant.payos.vn/v2/payment-requests/1760000000000001',
    );
  });
});
