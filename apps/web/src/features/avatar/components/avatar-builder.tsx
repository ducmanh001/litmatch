'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
import {
  useAvatarCatalog,
  useBuyAvatarItem,
  useClaimAvatarItem,
  useEquipAvatarItem,
  useMyAvatar,
  useMyAvatarItems,
} from '../api';

import type { AvatarAssetDto, AvatarSlot } from '../api';

const SLOT_TABS: ReadonlyArray<{ slot: AvatarSlot; label: string }> = [
  { slot: 'base', label: 'Nền' },
  { slot: 'hair', label: 'Tóc' },
  { slot: 'face', label: 'Mặt' },
  { slot: 'outfit', label: 'Trang phục' },
  { slot: 'accessory', label: 'Phụ kiện' },
];

/** Ghép layer theo zIndex — server đã sort sẵn (AvatarConfigDto.layers). */
export function AvatarLayerPreview({
  layers,
  size,
}: {
  layers: AvatarAssetDto[];
  size: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-full border-4 border-paper bg-surf2 dark:border-ink"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Ảnh đại diện ghép từ các layer đã trang bị"
    >
      {layers.map((layer) => (
        <img
          key={layer.id}
          src={layer.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: layer.zIndex }}
        />
      ))}
      {layers.length === 0 && (
        <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
          Chưa có
        </span>
      )}
    </div>
  );
}

/**
 * Builder avatar multi-layer (docs/services/avatar-service.md): catalog/giá từ server; item
 * free → claim rồi trang bị; item trả phí → xác nhận, mua qua Economy (Idempotency-Key) rồi
 * trang bị. Guard sở hữu thật nằm ở backend (equip chỉ nhận item đã sở hữu).
 */
export function AvatarBuilder() {
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('base');
  const myAvatar = useMyAvatar();
  const catalog = useAvatarCatalog();
  const myItems = useMyAvatarItems();
  const claimItem = useClaimAvatarItem();
  const buyItem = useBuyAvatarItem();
  const equipItem = useEquipAvatarItem();
  const { key, resetKey } = useIdempotencyKey();

  const ownedIds = new Set((myItems.data ?? []).map((item) => item.id));
  const equippedIds = new Set(
    (myAvatar.data?.layers ?? []).map((layer) => layer.id),
  );
  const slotItems = (catalog.data ?? []).filter(
    (item) => item.slot === activeSlot,
  );
  const busy = claimItem.isPending || buyItem.isPending || equipItem.isPending;

  const equip = (item: AvatarAssetDto) => {
    equipItem.mutate(
      { slot: item.slot, avatarAssetId: item.id },
      {
        onSuccess: () => showToast(`Đã trang bị ${item.name}`),
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.',
            'warn',
          ),
      },
    );
  };

  const onSelect = async (item: AvatarAssetDto) => {
    if (busy) return;
    if (ownedIds.has(item.id)) {
      equip(item);
      return;
    }
    if (item.priceDiamond === 0) {
      claimItem.mutate(item.id, {
        onSuccess: () => equip(item),
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.',
            'warn',
          ),
      });
      return;
    }
    const confirmed = await confirmAction({
      title: `Mua ${item.name}?`,
      message: `Giá ${item.priceDiamond} 💎 sẽ trừ vào ví của bạn.`,
      actionLabel: 'Mua',
    });
    if (!confirmed) return;
    buyItem.mutate(
      { assetId: item.id, idempotencyKey: key },
      {
        onSuccess: () => {
          resetKey();
          showToast(`Đã mua ${item.name} — trừ ${item.priceDiamond} 💎`);
          equip(item);
        },
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.',
            'warn',
          ),
      },
    );
  };

  return (
    <section
      aria-label="Tuỳ chỉnh ảnh đại diện"
      className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-surf"
    >
      <div className="mb-4 flex justify-center">
        <AvatarLayerPreview layers={myAvatar.data?.layers ?? []} size={96} />
      </div>

      <div
        role="tablist"
        aria-label="Nhóm item avatar"
        className="no-scrollbar mb-3 flex gap-2 overflow-x-auto"
      >
        {SLOT_TABS.map(({ slot, label }) => (
          <button
            key={slot}
            type="button"
            role="tab"
            aria-selected={activeSlot === slot}
            onClick={() => setActiveSlot(slot)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              activeSlot === slot
                ? 'bg-irisl text-white'
                : 'border border-black/10 text-slate-500 dark:border-white/10 dark:text-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(catalog.isPending || myAvatar.isPending) && (
        <p className="text-xs text-slate-500 dark:text-white/60">
          Đang tải catalog…
        </p>
      )}
      {catalog.isError && (
        <p role="alert" className="text-xs text-destructive">
          Không tải được catalog avatar.
        </p>
      )}
      {!catalog.isPending && !catalog.isError && slotItems.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-white/60">
          Chưa có item nào cho nhóm này.
        </p>
      )}

      {slotItems.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          {slotItems.map((item) => {
            const owned = ownedIds.has(item.id);
            const equipped = equippedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-pressed={equipped}
                aria-label={`${item.name}${
                  equipped ? ' (đang dùng)' : owned ? ' (đã sở hữu)' : ''
                }`}
                onClick={() => void onSelect(item)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition disabled:opacity-50 ${
                  equipped
                    ? 'border-iris bg-iris/10'
                    : 'border-black/5 hover:border-iris/30 dark:border-white/10'
                }`}
              >
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover"
                  loading="lazy"
                />
                <span className="w-full truncate text-[10px] font-bold">
                  {item.name}
                </span>
                {item.priceDiamond > 0 && !owned ? (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-sky-600 dark:text-diamond">
                    <DiamondIcon width={9} height={9} />
                    {item.priceDiamond}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    {equipped ? 'Đang dùng' : owned ? 'Đã có' : 'Miễn phí'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
