'use client';

import { isApiError } from '@litmatch/api-client';

import { useSpeedup } from '../api';

export function SpeedupButton({ ticketId }: { ticketId: string }) {
  const speedup = useSpeedup(ticketId);

  const message = isApiError(speedup.error)
    ? speedup.error.message
    : speedup.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-card disabled:opacity-50"
        disabled={speedup.isPending}
        // Mỗi lần bấm là 1 intent mới — sinh key mới ngay lúc bấm, không tái dùng từ lần trước.
        onClick={() => speedup.mutate(crypto.randomUUID())}
      >
        {speedup.isPending ? 'Đang xử lý…' : 'Ưu tiên (tốn diamond)'}
      </button>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
