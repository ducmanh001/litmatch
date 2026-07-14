'use client';

import { isApiError } from '@litmatch/api-client';

import { useWallet } from '../api';

export function WalletBalance() {
  const wallet = useWallet();

  if (wallet.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải ví…</p>;
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
      <p className="text-sm text-muted-foreground">Không có dữ liệu ví.</p>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">Số dư kim cương</p>
      <p className="text-3xl font-semibold">{wallet.data.balance}</p>
      {wallet.data.vipTier !== null && (
        <p className="mt-1 text-xs text-primary">
          VIP {wallet.data.vipTier.toUpperCase()} — hết hạn{' '}
          {wallet.data.vipExpiresAt !== null
            ? new Date(wallet.data.vipExpiresAt).toLocaleDateString('vi-VN')
            : ''}
        </p>
      )}
    </div>
  );
}
