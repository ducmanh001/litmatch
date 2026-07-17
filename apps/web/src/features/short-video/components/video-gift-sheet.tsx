'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
import { useGiftCatalog } from '../../party-room/api';
import { useSendVideoGift } from '../api';

/**
 * Sheet chọn quà tặng tác giả video (video.html "Tặng") — catalog + giá từ server, tiền chỉ
 * trừ khi server trả 200 (không fake hiệu ứng trước). Cùng catalog với Party Room.
 */
export function VideoGiftSheet({
  videoId,
  open,
  onClose,
}: {
  videoId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const catalog = useGiftCatalog();
  const sendGift = useSendVideoGift(videoId ?? '');
  const { key, resetKey } = useIdempotencyKey();

  if (!open || videoId === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Đóng bảng tặng quà"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        role="dialog"
        aria-label="Tặng quà cho tác giả video"
        className="relative w-full max-w-md rounded-t-3xl bg-white p-5 dark:bg-surf md:rounded-3xl"
      >
        <p className="mb-4 text-sm font-extrabold">Tặng quà cho tác giả</p>

        {catalog.isPending && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đang tải danh sách quà…
          </p>
        )}
        {catalog.isError && (
          <p role="alert" className="text-xs text-destructive">
            Không tải được danh sách quà.
          </p>
        )}
        {catalog.data !== undefined && catalog.data.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {catalog.data.map((gift) => (
              <button
                key={gift.id}
                type="button"
                disabled={sendGift.isPending}
                className="flex flex-col items-center gap-1 rounded-2xl border border-black/5 p-3 transition hover:border-iris/30 disabled:opacity-50 dark:border-white/10"
                onClick={() =>
                  sendGift.mutate(
                    { giftId: gift.id, idempotencyKey: key },
                    {
                      onSuccess: () => {
                        resetKey();
                        showToast(
                          `Đã tặng ${gift.name} — trừ ${gift.priceDiamond} 💎`,
                        );
                        onClose();
                      },
                      onError: (error) =>
                        showToast(
                          isApiError(error)
                            ? error.message
                            : 'Có lỗi xảy ra, thử lại.',
                          'warn',
                        ),
                    },
                  )
                }
              >
                <span className="text-xl" aria-hidden>
                  🎁
                </span>
                <span className="w-full truncate text-center text-[10px] font-bold">
                  {gift.name}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-sky-600 dark:text-diamond">
                  <DiamondIcon width={10} height={10} />
                  {gift.priceDiamond}
                </span>
              </button>
            ))}
          </div>
        )}
        {catalog.data !== undefined && catalog.data.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chưa có quà nào đang mở bán.
          </p>
        )}
      </div>
    </div>
  );
}
