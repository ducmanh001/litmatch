'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
import { useCreatePayosOrder, usePayosPackages } from '../api';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export function TopupPackages() {
  const packages = usePayosPackages();
  const createOrder = useCreatePayosOrder();
  const { key, resetKey } = useIdempotencyKey();

  if (packages.isPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Đang tải gói nạp…
      </p>
    );
  }

  if (packages.isError) {
    const message = isApiError(packages.error)
      ? packages.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  const items = packages.data ?? [];

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Chưa có gói nạp nào đang bán.
      </p>
    );
  }

  const errorMessage = isApiError(createOrder.error)
    ? createOrder.error.message
    : createOrder.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-500 dark:bg-surf2 dark:text-slate-400">
        Thanh toán chuyển khoản/VietQR qua payOS. Diamond chỉ được cộng sau khi
        hệ thống nhận và xác minh webhook ngân hàng.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.packageId}>
            <button
              type="button"
              disabled={createOrder.isPending}
              onClick={() =>
                createOrder.mutate(
                  {
                    packageId: item.packageId,
                    idempotencyKey: key,
                  },
                  {
                    onSuccess: (order) => {
                      resetKey();
                      if (order !== undefined) {
                        showToast('Đã tạo mã thanh toán an toàn.');
                      }
                    },
                  },
                )
              }
              className="w-full rounded-2xl border border-black/5 bg-white p-4 text-left transition hover:border-diamond/50 disabled:opacity-50 dark:border-white/10 dark:bg-surf"
            >
              <p className="flex items-center gap-1.5 text-lg font-extrabold">
                <DiamondIcon className="text-diamond" width={15} height={15} />
                {item.diamonds} kim cương
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {createOrder.isPending
                  ? 'Đang tạo mã…'
                  : vndFormatter.format(Number(item.amountVnd))}
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
      {createOrder.data !== undefined && (
        <div className="rounded-2xl border border-irisl/30 bg-irisl/10 p-4">
          <p className="text-sm font-bold text-ink dark:text-white">
            Mã thanh toán đã sẵn sàng
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Đơn {createOrder.data.orderCode} ·{' '}
            {vndFormatter.format(Number(createOrder.data.amountVnd))}
          </p>
          {createOrder.data.checkoutUrl !== null && (
            <a
              href={createOrder.data.checkoutUrl}
              className="mt-3 inline-flex rounded-xl bg-irisl px-4 py-2 text-sm font-bold text-white"
            >
              Mở payOS để thanh toán
            </a>
          )}
        </div>
      )}
    </div>
  );
}
