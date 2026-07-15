import Link from 'next/link';

import { PartyIcon, DiscoveryIcon } from '../../../shared/ui/icons';

/** 2 banner quảng bá tính năng — chèn dưới ô đăng bài, đúng vị trí bố cục feed thường thấy. */
export function FeedBanners() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link
        href="/party"
        className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-irisl to-irisl p-4 text-white shadow-lg shadow-iris/25"
      >
        <PartyIcon width={22} height={22} />
        <div className="mt-6">
          <p className="font-bold leading-tight">Party Room đang hot 🔥</p>
          <p className="mt-0.5 text-xs text-white/80">
            Vào phòng, buôn chuyện cùng mọi người
          </p>
        </div>
      </Link>
      <Link
        href="/discovery"
        className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-aqual to-irisl p-4 text-white shadow-lg shadow-iris/25"
      >
        <DiscoveryIcon width={22} height={22} />
        <div className="mt-6">
          <p className="font-bold leading-tight">Khám phá bạn mới</p>
          <p className="mt-0.5 text-xs text-white/80">
            Duyệt hồ sơ quanh bạn, kết nối ngay
          </p>
        </div>
      </Link>
    </div>
  );
}
