'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { isApiError } from '@litmatch/api-client';
import { useQueryClient } from '@tanstack/react-query';

import { usePayosOrder, walletKeys } from '../api';

export function PayosPaymentStatus() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('paymentOrder');
  const order = usePayosOrder(orderId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (order.data?.status === 'paid') {
      void queryClient.invalidateQueries({ queryKey: walletKeys.wallet });
    }
  }, [order.data?.status, queryClient]);

  if (orderId === null) return null;

  if (order.isPending) {
    return (
      <p className="rounded-2xl bg-slate-100 p-4 text-sm dark:bg-surf2">
        Đang kiểm tra thanh toán…
      </p>
    );
  }

  if (order.isError) {
    return (
      <p
        role="alert"
        className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
      >
        {isApiError(order.error)
          ? order.error.message
          : 'Không thể kiểm tra đơn thanh toán.'}
      </p>
    );
  }

  if (order.data?.status === 'paid') {
    return (
      <p className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        Thanh toán thành công — đã cộng {order.data.diamonds} Diamond.
      </p>
    );
  }

  if (order.data?.status === 'expired' || order.data?.status === 'cancelled') {
    return (
      <p className="rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
        Đơn thanh toán đã hết hạn hoặc bị huỷ. Bạn có thể tạo đơn mới.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-sky-500/10 p-4 text-sm text-sky-700 dark:text-sky-300">
      <p>Đang chờ ngân hàng xác nhận thanh toán.</p>
      <button
        type="button"
        onClick={() => void order.refetch()}
        disabled={order.isFetching}
        className="mt-2 font-bold underline disabled:opacity-50"
      >
        {order.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
      </button>
    </div>
  );
}
