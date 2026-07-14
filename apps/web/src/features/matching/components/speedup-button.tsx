'use client';

import { isApiError } from '@litmatch/api-client';

import { Button } from '../../../shared/ui/button';
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="border-black/10 bg-transparent hover:bg-black/5 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
        disabled={speedup.isPending}
        // Mỗi lần bấm là 1 intent mới — sinh key mới ngay lúc bấm, không tái dùng từ lần trước.
        onClick={() => speedup.mutate(crypto.randomUUID())}
      >
        {speedup.isPending ? 'Đang xử lý…' : 'Ưu tiên (tốn diamond)'}
      </Button>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
