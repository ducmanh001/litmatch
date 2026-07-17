'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
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
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Đang tải gói nạp…
      </p>
    );
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
      <p className="text-sm text-slate-500 dark:text-slate-400">
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
      <p className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-500 dark:bg-surf2 dark:text-slate-400">
        Chế độ test (dev) — không phải thanh toán thật, chỉ dùng để kiểm thử
        luồng nạp.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  {
                    onSuccess: () => {
                      resetKey();
                      // layouts/web/wallet.html: lmToast('Nạp thành công +N 💎 ...') sau khi
                      // nạp thật thành công — dùng diamonds thật của gói vừa mua, không bịa số.
                      showToast(`Nạp thành công +${product.diamonds} 💎`);
                    },
                  },
                )
              }
              className="w-full rounded-2xl border border-black/5 bg-white p-4 text-left transition hover:border-diamond/50 disabled:opacity-50 dark:border-white/10 dark:bg-surf"
            >
              <p className="flex items-center gap-1.5 text-lg font-extrabold">
                <DiamondIcon className="text-diamond" width={15} height={15} />
                {product.diamonds} kim cương
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
        <p className="text-sm font-semibold text-irisl">
          Nạp thành công — số dư đã cập nhật.
        </p>
      )}
    </div>
  );
}
