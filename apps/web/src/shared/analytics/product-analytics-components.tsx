'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useCurrentUser } from '../auth/use-current-user';
import { useTranslation } from '../i18n/messages';
import {
  getProductAnalyticsConsent,
  identifyProductAnalyticsUser,
  productAnalyticsConfig,
  setProductAnalyticsConsent,
  subscribeProductAnalyticsConsent,
} from './product-analytics';

export function ProductAnalyticsIdentity() {
  const profile = useCurrentUser();
  const consent = useSyncExternalStore(
    subscribeProductAnalyticsConsent,
    getProductAnalyticsConsent,
    () => null,
  );

  useEffect(() => {
    if (consent !== 'accepted' || profile.data === undefined) return;
    identifyProductAnalyticsUser({
      id: profile.data.id,
      nickname: profile.data.nickname,
      isGuest: profile.data.isGuest,
    });
  }, [consent, profile.data]);
  return null;
}

export function ProductAnalyticsConsentBanner() {
  const consent = useSyncExternalStore(
    subscribeProductAnalyticsConsent,
    getProductAnalyticsConsent,
    () => null,
  );
  const t = useTranslation();
  if (productAnalyticsConfig === null || consent !== null) return null;

  return (
    <aside
      aria-label={t('analytics.consentTitle')}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-surf/95"
    >
      <div className="text-sm font-bold">{t('analytics.consentTitle')}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t('analytics.consentDescription')}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl border border-black/10 px-4 py-2 text-xs font-bold dark:border-white/10"
          onClick={() => setProductAnalyticsConsent('declined')}
        >
          {t('analytics.decline')}
        </button>
        <button
          type="button"
          className="rounded-xl bg-iris px-4 py-2 text-xs font-bold text-white"
          onClick={() => setProductAnalyticsConsent('accepted')}
        >
          {t('analytics.accept')}
        </button>
      </div>
    </aside>
  );
}
