'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { DiamondIcon } from '../../../shared/ui/icons';
import { usePurchaseVip, useVipPlans, useWallet } from '../api';

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

export function VipPlans() {
  const wallet = useWallet();
  const plans = useVipPlans();
  const purchaseVip = usePurchaseVip();
  // Giữ nguyên key khi timeout/retry; chỉ reset sau response thành công từ server.
  const { key: idempotencyKey, resetKey } = useIdempotencyKey();
  const vipTier = wallet.data?.vipTier ?? null;
  const vipExpiresAt = wallet.data?.vipExpiresAt ?? null;

  const purchase = (plan: NonNullable<typeof plans.data>[number]): void => {
    void (async () => {
      const confirmed = await confirmAction({
        title: `Nâng cấp ${plan.tier.toUpperCase()}?`,
        message: `Gói ${plan.days} ngày có giá ${plan.priceDiamond} diamond. Thời hạn sẽ được cộng dồn nếu bạn đang có VIP.`,
        actionLabel: `Mua với ${plan.priceDiamond} diamond`,
      });
      if (!confirmed) return;
      purchaseVip.mutate(
        { planId: plan.id, idempotencyKey },
        {
          onSuccess: (result) => {
            if (result === undefined) return;
            resetKey();
            showToast(
              `Đã nâng cấp ${result.tier.toUpperCase()} đến ${new Date(result.vipExpiresAt).toLocaleDateString('vi-VN')}`,
            );
          },
        },
      );
    })();
  };

  const errorMessage = isApiError(plans.error)
    ? plans.error.message
    : isApiError(purchaseVip.error)
      ? purchaseVip.error.message
      : plans.error != null || purchaseVip.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined;

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

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Chọn gói VIP
        </h3>
        {plans.isPending && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Đang tải bảng giá…
          </p>
        )}
        {plans.isSuccess && (plans.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chưa có gói VIP nào đang bán.
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {(plans.data ?? []).map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                disabled={purchaseVip.isPending}
                onClick={() => purchase(plan)}
                className="w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-left transition hover:border-amber-400 disabled:opacity-50"
                aria-label={`Mua ${plan.tier.toUpperCase()} ${plan.days} ngày với ${plan.priceDiamond} diamond`}
              >
                <p className="font-bold">
                  {plan.tier.toUpperCase()} · {plan.days} ngày
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-300">
                  <DiamondIcon width={14} height={14} />
                  {plan.priceDiamond} diamond
                </p>
              </button>
            </li>
          ))}
        </ul>
        {errorMessage !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
