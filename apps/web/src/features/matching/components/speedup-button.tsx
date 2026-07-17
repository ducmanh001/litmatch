'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { confirmAction } from '../../../shared/lib/confirm-store';
import { Button } from '../../../shared/ui/button';
import { DiamondIcon } from '../../../shared/ui/icons';
import { useSpeedup } from '../api';

export function SpeedupButton({
  ticketId,
  priceDiamond,
}: {
  ticketId: string;
  priceDiamond: number;
}) {
  const speedup = useSpeedup(ticketId);
  // Một key đại diện cho đúng một ý định mua speed-up. Lỗi mạng/API vẫn giữ key cũ để
  // server replay an toàn; chỉ khi giao dịch thành công mới chuẩn bị key cho lần mua mới.
  const { key, resetKey } = useIdempotencyKey();

  const message = isApiError(speedup.error)
    ? speedup.error.message
    : speedup.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  const handleSpeedup = (): void => {
    void (async () => {
      const confirmed = await confirmAction({
        title: `Dùng ${priceDiamond} diamond để ưu tiên?`,
        message: `Litmatch sẽ trừ chính xác ${priceDiamond} diamond cho một lần tăng ưu tiên trong hàng chờ. Tính năng này không bảo đảm có kết quả ngay.`,
        actionLabel: `Dùng ${priceDiamond} diamond`,
      });
      if (confirmed) {
        speedup.mutate(key, { onSuccess: resetKey });
      }
    })();
  };

  return (
    <div className="max-w-52 space-y-1.5 text-center">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="border-diamond/30 bg-diamond/10 text-diamond-foreground hover:bg-diamond/15 dark:border-iris/30 dark:bg-iris/15 dark:text-white dark:hover:bg-iris/20"
        disabled={speedup.isPending}
        onClick={handleSpeedup}
      >
        {speedup.isPending ? (
          'Đang xử lý…'
        ) : (
          <span className="flex items-center gap-1.5">
            <DiamondIcon width={13} height={13} />
            Ưu tiên · {priceDiamond} diamond
          </span>
        )}
      </Button>
      <p className="text-[10px] leading-4 text-muted-foreground dark:text-white/70">
        Tuỳ chọn có tính phí · không bảo đảm kết quả ngay
      </p>
      {message !== undefined && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
