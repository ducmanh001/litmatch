'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { Button } from '../../../shared/ui/button';
import { useSetLocation, useSetNearbyVisible } from '../api';

/** Không có endpoint đọc `nearbyVisible` hiện tại (chỉ có PUT ghi) — component tự theo dõi trạng
 * thái đã bật trong phiên này, KHÔNG suy đoán trạng thái server từ trước (docs/services/discovery-service.md § 8.2). */
export function NearbyOptIn({ onEnabled }: { onEnabled: () => void }) {
  const setLocation = useSetLocation();
  const setVisible = useSetNearbyVisible();
  const [geoError, setGeoError] = useState<string | undefined>(undefined);

  const enable = (): void => {
    setGeoError(undefined);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Trình duyệt không hỗ trợ định vị.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation.mutate(
          {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
          {
            onSuccess: () => {
              setVisible.mutate(true, { onSuccess: onEnabled });
            },
          },
        );
      },
      () => {
        setGeoError(
          'Không lấy được vị trí — kiểm tra quyền định vị trình duyệt.',
        );
      },
    );
  };

  const isPending = setLocation.isPending || setVisible.isPending;
  const errorMessage =
    geoError ??
    (isApiError(setLocation.error)
      ? setLocation.error.message
      : isApiError(setVisible.error)
        ? setVisible.error.message
        : undefined);

  return (
    <div className="mx-5 rounded-2xl border border-black/5 bg-white p-5 text-center dark:border-white/5 dark:bg-surf">
      <p className="mb-1 text-sm font-bold">Bật hiển thị Nearby</p>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Chia sẻ vị trí gần đúng để xem người quanh bạn — chỉ hiển thị khoảng
        cách ước lượng, không bao giờ lộ toạ độ chính xác. Chỉ 2 chiều: bạn cũng
        phải bật thì mới thấy người khác.
      </p>
      {errorMessage !== undefined && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      <Button
        type="button"
        className="w-full"
        disabled={isPending}
        onClick={enable}
      >
        {isPending ? 'Đang bật…' : 'Bật Nearby'}
      </Button>
    </div>
  );
}
