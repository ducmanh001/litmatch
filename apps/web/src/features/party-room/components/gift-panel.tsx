'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
import { useGiftCatalog, useSendGift } from '../api';

import type { SVGProps } from 'react';

export function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      {...props}
    >
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M3 8h18M12 8v13" />
      <path d="M12 8c-1.2-3.5-6-3.3-6-.8S9 8 12 8s6-1.7 6-4.2-4.8-2.7-6 .8z" />
    </svg>
  );
}

export function GiftPanel({
  roomId,
  receiverUserId,
  onSent,
}: {
  roomId: string;
  receiverUserId: string;
  onSent?: (giftName: string) => void;
}) {
  const catalog = useGiftCatalog();
  const sendGift = useSendGift(roomId);
  const { key, resetKey } = useIdempotencyKey();

  const message = isApiError(sendGift.error)
    ? sendGift.error.message
    : sendGift.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-surf">
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
      {catalog.data !== undefined && catalog.data.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Chưa có quà nào đang mở bán.
        </p>
      )}
      {catalog.data !== undefined && catalog.data.length > 0 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto">
          {catalog.data.map((gift) => (
            <button
              key={gift.id}
              type="button"
              disabled={sendGift.isPending}
              className="flex w-16 shrink-0 flex-col items-center gap-1 transition hover:scale-105 disabled:opacity-50"
              onClick={() =>
                sendGift.mutate(
                  { giftId: gift.id, receiverUserId, idempotencyKey: key },
                  {
                    onSuccess: () => {
                      resetKey();
                      // layouts/web/party-room.html: lmToast('Đã tặng ' + name + ' — trừ ' + cost + ' 💎')
                      // sau khi gift thật sự gửi thành công (không fake trừ DIA ở client).
                      showToast(
                        `Đã tặng ${gift.name} — trừ ${gift.priceDiamond} 💎`,
                      );
                      onSent?.(gift.name);
                    },
                  },
                )
              }
            >
              <GiftIcon width={22} height={22} />
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
      {message !== undefined && (
        <p role="alert" className="pt-2 text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
