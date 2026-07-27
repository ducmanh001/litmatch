'use client';

import { useEffect } from 'react';

import { useCurrentUser } from '../auth/use-current-user';
import { useTranslation } from '../i18n/messages';
import {
  identifyProductAnalyticsUser,
  productAnalyticsConfig,
} from './product-analytics';

export function ProductAnalyticsIdentity() {
  const profile = useCurrentUser();
  useEffect(() => {
    if (profile.data === undefined) return;
    identifyProductAnalyticsUser({
      id: profile.data.id,
      isGuest: profile.data.isGuest,
    });
  }, [profile.data]);

  return null;
}

/**
 * Analytics luôn bật khi đã cấu hình PostHog.
 */
export function ProductAnalyticsPreference() {
  const t = useTranslation();

  if (productAnalyticsConfig === null) return null;
  const enabled = true;

  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {t('analytics.settingsSection')}
      </p>
      <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-surf">
        <div className="flex-1">
          <p className="text-sm font-semibold">{t('analytics.consentTitle')}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t('analytics.consentDescription')}
          </p>
        </div>
        <div
          role="switch"
          aria-checked={enabled}
          aria-label={t('analytics.consentTitle')}
          className="relative h-6 w-11 shrink-0 rounded-full bg-irisl"
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
}
