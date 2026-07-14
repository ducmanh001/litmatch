'use client';

import { isApiError } from '@litmatch/api-client';

import { DiamondIcon } from '../../../shared/ui/icons';
import { useWallet } from '../api';

export function WalletBalance() {
  const wallet = useWallet();

  if (wallet.isPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải ví…</p>
    );
  }

  if (wallet.isError) {
    const message = isApiError(wallet.error)
      ? wallet.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (wallet.data === undefined) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Không có dữ liệu ví.
      </p>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-diamond to-irisl p-6 text-white">
      <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
      <p className="relative mb-2 text-xs font-bold uppercase tracking-wide opacity-80">
        Số dư kim cương
      </p>
      <div className="relative flex items-center gap-2">
        <DiamondIcon width={26} height={26} />
        <span className="font-display text-4xl font-semibold">
          {wallet.data.balance}
        </span>
      </div>
      {wallet.data.vipTier !== null && (
        <p className="relative mt-3 text-xs font-semibold opacity-90">
          VIP {wallet.data.vipTier.toUpperCase()} — hết hạn{' '}
          {wallet.data.vipExpiresAt !== null
            ? new Date(wallet.data.vipExpiresAt).toLocaleDateString('vi-VN')
            : ''}
        </p>
      )}
    </div>
  );
}
