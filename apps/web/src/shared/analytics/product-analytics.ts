'use client';

import posthog from 'posthog-js';

import { env } from '../env';

export type ProductAnalyticsConsent = 'accepted' | 'declined' | null;

export interface ProductAnalyticsConfig {
  projectToken: string;
  host: string;
}

export interface AnalyticsUser {
  id: string;
  nickname: string;
  isGuest: boolean;
}

const CONSENT_STORAGE_KEY = 'litmatch-web.product-analytics-consent';
const consentSubscribers = new Set<() => void>();

export const productAnalyticsConfig: ProductAnalyticsConfig | null =
  env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN !== undefined &&
  env.NEXT_PUBLIC_POSTHOG_HOST !== undefined
    ? {
        projectToken: env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
        host: env.NEXT_PUBLIC_POSTHOG_HOST,
      }
    : null;

export function initializeProductAnalytics(
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): boolean {
  if (config === null) return false;
  if (posthog.__loaded) return true;

  posthog.init(config.projectToken, {
    api_host: config.host,
    defaults: '2026-05-30',
    autocapture: true,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: true,
    session_recording: {
      maskAllInputs: true,
      // Litmatch có chat/profile nhạy cảm: replay chỉ cần layout + thao tác, không cần nội dung.
      maskTextSelector: '*',
    },
  });

  if (getProductAnalyticsConsent() === 'accepted') {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
  return true;
}

export function getProductAnalyticsConsent(): ProductAnalyticsConsent {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return stored === 'accepted' || stored === 'declined' ? stored : null;
}

export function subscribeProductAnalyticsConsent(
  subscriber: () => void,
): () => void {
  consentSubscribers.add(subscriber);
  return () => consentSubscribers.delete(subscriber);
}

export function setProductAnalyticsConsent(
  consent: Exclude<ProductAnalyticsConsent, null>,
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (config === null || typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  if (consent === 'accepted') {
    posthog.opt_in_capturing();
    posthog.capture('$pageview');
  } else {
    posthog.opt_out_capturing();
  }
  consentSubscribers.forEach((subscriber) => subscriber());
}

export function identifyProductAnalyticsUser(
  user: AnalyticsUser,
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (config === null || getProductAnalyticsConsent() !== 'accepted') return;
  posthog.identify(user.id, {
    nickname: user.nickname,
    account_type: user.isGuest ? 'guest' : 'registered',
  });
}

export function resetProductAnalyticsUser(
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (config === null || !posthog.__loaded) return;
  posthog.reset();
}
