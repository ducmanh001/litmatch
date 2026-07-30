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
      isGuest: profile.data.isGuest,
    });
  }, [consent, profile.data]);

  return null;
}

export function ProductAnalyticsPreference() {
  const t = useTranslation();
  const consent = useSyncExternalStore(
    subscribeProductAnalyticsConsent,
    getProductAnalyticsConsent,
    () => null,
  );

  if (productAnalyticsConfig === null) return null;
  const enabled = consent === 'accepted';

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
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('analytics.consentTitle')}
          onClick={() =>
            setProductAnalyticsConsent(enabled ? 'declined' : 'accepted')
          }
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-irisl' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}
