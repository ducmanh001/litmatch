'use client';

import { useWallet } from '../api';

import type { SVGProps } from 'react';

function BenefitIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const BENEFITS = [
  {
    title: 'Ưu tiên ghép nhanh',
    description: 'Vào hàng chờ Soul & Voice Match trước tất cả',
    path: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  },
  {
    title: 'Xem ai đã thích bạn',
    description: 'Mở khoá danh sách lượt thích ở Khám phá',
    path: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z',
    extra: <circle cx={12} cy={12} r={3} />,
  },
  {
    title: 'Voice Match không giới hạn',
    description: 'Bỏ giới hạn thời lượng mỗi cuộc gọi',
    path: 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z',
    extra: <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />,
  },
  {
    title: 'Huy hiệu VIP trên hồ sơ',
    description: 'Nổi bật hơn ở Feed, Khám phá & Party Room',
    path: 'M4 21c0-4 4-6 8-6s8 2 8 6',
    extra: <circle cx={12} cy={8} r={4} />,
  },
];

/**
 * Backend đã có POST /economy/vip/purchase (mua thật, cộng dồn hạn) nhưng KHÔNG có endpoint
 * GET liệt kê gói/giá VIP — bảng giá ở DB (vip_plans), "không hardcode" (docs/05 §5.1). Vì vậy
 * tab này chỉ dựng UI tĩnh (tab-switcher, promo, benefits) và disable nút nâng cấp với trạng
 * thái "sắp có" thay vì đoán/hardcode planId + giá ở FE — cần bổ sung GET /economy/vip/plans
 * trước khi wire nút này thật.
 */
export function VipPlans() {
  const wallet = useWallet();
  const vipTier = wallet.data?.vipTier ?? null;
  const vipExpiresAt = wallet.data?.vipExpiresAt ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 p-6 text-white">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-90">
          Litmatch VIP
        </p>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          Ưu tiên mọi lúc
        </h2>
        <p className="text-sm opacity-90">
          Ghép nhanh hơn, thấy ai đã thích bạn, và nhiều đặc quyền chỉ dành cho
          VIP.
        </p>
        {vipTier !== null && (
          <p className="mt-3 text-xs font-bold">
            Bạn đang là {vipTier.toUpperCase()}
            {vipExpiresAt !== null
              ? ` — hết hạn ${new Date(vipExpiresAt).toLocaleDateString('vi-VN')}`
              : ''}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {BENEFITS.map((benefit) => (
          <div
            key={benefit.title}
            className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-surf"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
              <BenefitIcon>
                <path d={benefit.path} />
                {benefit.extra}
              </BenefitIcon>
            </span>
            <div>
              <p className="text-sm font-bold">{benefit.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {benefit.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-500 dark:bg-surf2 dark:text-slate-400">
        Bảng giá gói VIP đang được hoàn thiện — chưa thể hiển thị/mua ngay trên
        web.
      </p>
      <button
        type="button"
        disabled
        aria-label="Nâng cấp VIP ngay (sắp có)"
        className="w-full rounded-full bg-gradient-to-br from-amber-400 to-amber-600 py-3.5 font-bold text-white opacity-50 shadow-lg shadow-amber-500/30"
      >
        Nâng cấp VIP ngay
      </button>
    </div>
  );
}
