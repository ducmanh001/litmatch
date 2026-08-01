'use client';

import { isApiError } from '@litmatch/api-client';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { useLocale } from '../../../shared/i18n/locale-store';
import { formatDate } from '../../../shared/i18n/formatters';
import { useTranslation } from '../../../shared/i18n/messages';
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
    titleKey: 'wallet.benefit.fastTitle',
    descriptionKey: 'wallet.benefit.fastDescription',
    path: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  },
  {
    titleKey: 'wallet.benefit.likesTitle',
    descriptionKey: 'wallet.benefit.likesDescription',
    path: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z',
    extra: <circle cx={12} cy={12} r={3} />,
  },
  {
    titleKey: 'wallet.benefit.voiceTitle',
    descriptionKey: 'wallet.benefit.voiceDescription',
    path: 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z',
    extra: <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />,
  },
  {
    titleKey: 'wallet.benefit.badgeTitle',
    descriptionKey: 'wallet.benefit.badgeDescription',
    path: 'M4 21c0-4 4-6 8-6s8 2 8 6',
    extra: <circle cx={12} cy={8} r={4} />,
  },
];

export function VipPlans() {
  const wallet = useWallet();
  const plans = useVipPlans();
  const purchaseVip = usePurchaseVip();
  const locale = useLocale();
  const t = useTranslation();
  // Giữ nguyên key khi timeout/retry; chỉ reset sau response thành công từ server.
  const { key: idempotencyKey, resetKey } = useIdempotencyKey();
  const vipTier = wallet.data?.vipTier ?? null;
  const vipExpiresAt = wallet.data?.vipExpiresAt ?? null;

  const purchase = (plan: NonNullable<typeof plans.data>[number]): void => {
    void (async () => {
      const confirmed = await confirmAction({
        title: t('wallet.confirmUpgrade', { tier: plan.tier.toUpperCase() }),
        message: t('wallet.confirmPlan', {
          days: plan.days,
          price: plan.priceDiamond,
        }),
        actionLabel: t('wallet.confirmPurchase', { price: plan.priceDiamond }),
      });
      if (!confirmed) return;
      purchaseVip.mutate(
        { planId: plan.id, idempotencyKey },
        {
          onSuccess: (result) => {
            if (result === undefined) return;
            resetKey();
            showToast(
              t('wallet.upgradedUntil', {
                tier: result.tier.toUpperCase(),
                date: formatDate(result.vipExpiresAt, locale),
              }),
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
        ? t('common.somethingWentWrong')
        : undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-gradient-to-br from-irisl to-iris p-6 text-white shadow-lg shadow-iris/20">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-90">
          Litmatch VIP
        </p>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          {t('wallet.vipTitle')}
        </h2>
        <p className="text-sm opacity-90">{t('wallet.vipDescription')}</p>
        {vipTier !== null && (
          <p className="mt-3 text-xs font-bold">
            {vipTier.toUpperCase()}
            {vipExpiresAt !== null
              ? ` — ${formatDate(vipExpiresAt, locale)}`
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iris/15 text-irisl">
              <BenefitIcon>
                <path d={benefit.path} />
                {benefit.extra}
              </BenefitIcon>
            </span>
            <div>
              <p className="text-sm font-bold">{t(benefit.titleKey)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(benefit.descriptionKey)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t('wallet.choosePlan')}
        </h3>
        {plans.isPending && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('wallet.loadingPlans')}
          </p>
        )}
        {plans.isSuccess && (plans.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('wallet.noPlans')}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {(plans.data ?? []).map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                disabled={purchaseVip.isPending}
                onClick={() => purchase(plan)}
                className="w-full rounded-2xl border border-iris/30 bg-iris/10 p-4 text-left transition hover:border-irisl hover:bg-iris/15 disabled:opacity-50"
                aria-label={t('wallet.buyPlan', {
                  tier: plan.tier.toUpperCase(),
                  days: plan.days,
                  price: plan.priceDiamond,
                })}
              >
                <p className="font-bold">
                  {t('wallet.planLabel', {
                    tier: plan.tier.toUpperCase(),
                    days: plan.days,
                  })}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-irisl">
                  <DiamondIcon width={14} height={14} />
                  {t('wallet.planPrice', { price: plan.priceDiamond })}
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
