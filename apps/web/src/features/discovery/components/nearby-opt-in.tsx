'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { Button } from '../../../shared/ui/button';
import { useSetLocation, useSetNearbyVisible } from '../api';

function LocationMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx={12} cy={10} r={2.5} />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/** Radar quét quanh bạn — giống hiệu ứng .pulsering đã dùng ở queue-status-panel (đang tìm ghép
 * đôi), tái dùng animation đó thay vì định nghĩa keyframes riêng cho mockup Quanh đây. */
function RadarVisual() {
  return (
    <div className="relative h-30 w-30 shrink-0 sm:h-35 sm:w-35">
      <div className="absolute inset-0 rounded-full border border-iris/30 dark:border-rose-300/25" />
      <div className="absolute inset-5 rounded-full border border-iris/30 dark:border-rose-300/25" />
      <div className="absolute inset-10 rounded-full border border-iris/30 dark:border-rose-300/25" />
      <span className="pulsering absolute inset-10 rounded-full border border-irisl" />
      <span className="pulsering2 absolute inset-10 rounded-full border border-irisl" />
      <div className="absolute inset-10 m-auto h-3.5 w-3.5 rounded-full bg-gradient-to-r from-aqua to-irisl ring-4 ring-card dark:ring-surf" />
      <span className="absolute left-11.5 top-1.5 h-2 w-2 rounded-full bg-gradient-to-r from-aqua to-irisl ring-2 ring-card dark:ring-surf sm:left-13.5" />
      <span className="absolute right-0 top-13 h-2 w-2 rounded-full bg-gradient-to-r from-aqua to-irisl ring-2 ring-card dark:ring-surf sm:top-15.5" />
      <span className="absolute bottom-2.5 left-4 h-2 w-2 rounded-full bg-gradient-to-r from-aqua to-irisl ring-2 ring-card dark:ring-surf" />
    </div>
  );
}

/** Không có endpoint đọc `nearbyVisible` hiện tại (chỉ có PUT ghi) — component tự theo dõi trạng
 * thái đã bật trong phiên này, KHÔNG suy đoán trạng thái server từ trước (docs/services/discovery-service.md § 8.2). */
export function NearbyOptIn({
  onEnabled,
  needsLocationRefresh = false,
}: {
  onEnabled: () => void;
  needsLocationRefresh?: boolean;
}) {
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
          'Không lấy được vị trí — hãy kiểm tra quyền định vị của trình duyệt.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const isPending = setLocation.isPending || setVisible.isPending;
  const errorMessage =
    geoError ??
    (isApiError(setLocation.error)
      ? setLocation.error.message
      : isApiError(setVisible.error)
        ? setVisible.error.message
        : setLocation.isError || setVisible.isError
          ? 'Không thể bật Quanh đây lúc này. Vui lòng thử lại.'
          : undefined);

  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl border border-iris/20 bg-gradient-to-br from-card via-card to-iris/10 p-5 shadow-sm shadow-iris/[0.05] dark:border-white/10 dark:bg-gradient-to-br dark:from-surf dark:to-iris/[0.06] dark:shadow-none md:p-8">
        <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-iris/15 blur-2xl dark:bg-iris/[0.08]" />
        <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:gap-8 md:text-left">
          <RadarVisual />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold dark:text-white md:text-2xl">
              {needsLocationRefresh
                ? 'Cập nhật vị trí để tiếp tục'
                : 'Tìm một kết nối ý nghĩa ở gần bạn'}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground dark:text-white/80">
              {needsLocationRefresh
                ? 'Vị trí đã hết hạn hoặc chưa được lưu. Cập nhật lại để xem những hồ sơ cùng chủ động xuất hiện trong Quanh đây.'
                : 'Bật vị trí để xem những hồ sơ cũng chủ động xuất hiện trong Quanh đây.'}{' '}
              Bạn chỉ thấy khoảng cách theo vùng, không thấy tọa độ hay khoảng
              cách chính xác.
            </p>

            {errorMessage !== undefined && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}

            <Button
              type="button"
              className="mt-4 bg-gradient-to-r from-aqua to-irisl text-white shadow-md shadow-iris/15 hover:brightness-95"
              disabled={isPending}
              onClick={enable}
            >
              <LocationMark size={16} />
              {isPending
                ? 'Đang cập nhật…'
                : needsLocationRefresh
                  ? 'Cập nhật vị trí'
                  : 'Bật tìm quanh đây'}
            </Button>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground dark:text-white/70">
              Trình duyệt sẽ hỏi quyền vị trí trước khi tiếp tục.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 gap-2.5 text-xs leading-5 text-muted-foreground dark:text-white/75">
          <ShieldIcon className="mt-0.5 shrink-0 text-irisl" />
          Hệ thống chỉ lưu vị trí đã làm gần đúng để bảo vệ riêng tư.
        </div>
        <div className="flex flex-1 gap-2.5 text-xs leading-5 text-muted-foreground dark:text-white/75">
          <SwapIcon className="mt-0.5 shrink-0 text-irisl" />
          Cơ chế hai chiều: chỉ những người cùng bật mới có thể thấy nhau.
        </div>
      </div>
    </div>
  );
}
