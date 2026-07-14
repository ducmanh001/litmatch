'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { useIapProducts, useVerifyIap } from '../api';

/**
 * Web không có SDK App Store/Google Play thật (docs/07 roadmap Giai đoạn 1) — flow này gọi
 * thẳng /economy/iap/verify với payload devTransactionId, chỉ chạy được khi backend cấu hình
 * ECONOMY_IAP_VERIFIER=dev (mặc định local/test, hard-block ở production).
 */
export function TopupPackages() {
  const products = useIapProducts();
  const verifyIap = useVerifyIap();
  const { key, resetKey } = useIdempotencyKey();

  if (products.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải gói nạp…</p>;
  }

  if (products.isError) {
    const message = isApiError(products.error)
      ? products.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  const items = products.data ?? [];

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có gói nạp nào đang bán.
      </p>
    );
  }

  const errorMessage = isApiError(verifyIap.error)
    ? verifyIap.error.message
    : verifyIap.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
        Chế độ test (dev) — không phải thanh toán thật, chỉ dùng để kiểm thử
        luồng nạp.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map((product) => (
          <li key={product.productId}>
            <button
              type="button"
              disabled={verifyIap.isPending}
              onClick={() =>
                verifyIap.mutate(
                  {
                    provider: product.provider,
                    productId: product.productId,
                    devTransactionId: key,
                  },
                  { onSuccess: () => resetKey() },
                )
              }
              className="w-full rounded-md border border-border p-4 text-left hover:bg-card disabled:opacity-50"
            >
              <p className="text-lg font-semibold">
                {product.diamonds} kim cương
              </p>
              <p className="text-xs text-muted-foreground">
                {verifyIap.isPending ? 'Đang xử lý…' : 'Nạp ngay (test)'}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {errorMessage !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {verifyIap.isSuccess && (
        <p className="text-sm text-primary">
          Nạp thành công — số dư đã cập nhật.
        </p>
      )}
    </div>
  );
}
