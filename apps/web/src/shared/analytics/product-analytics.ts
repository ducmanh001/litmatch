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
  isGuest: boolean;
}

export interface ProductWebVital {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: string;
}

const CONSENT_COOKIE_NAME = 'litmatch-web.product-analytics-consent';
const CONSENT_COOKIE_MAX_AGE_SECONDS = 31_536_000;
const WEB_VITALS_SAMPLE_PERCENT = 10;
const CORE_WEB_VITAL_NAMES = new Set(['LCP', 'INP', 'CLS']);
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
  if (config === null || getProductAnalyticsConsent() !== 'accepted') {
    return false;
  }
  if (posthog.__loaded) return true;

  posthog.init(config.projectToken, {
    api_host: config.host,
    defaults: '2026-05-30',
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
  });

  posthog.opt_in_capturing();
  return true;
}

export function getProductAnalyticsConsent(): ProductAnalyticsConsent {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${CONSENT_COOKIE_NAME}=`))
    ?.split('=', 2)[1];
  return value === 'accepted' || value === 'declined' ? value : null;
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
  if (typeof document === 'undefined') return;

  document.cookie = `${CONSENT_COOKIE_NAME}=${consent}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  if (consent === 'accepted') {
    if (posthog.__loaded) {
      posthog.opt_in_capturing();
    } else {
      initializeProductAnalytics(config);
    }
  } else if (posthog.__loaded) {
    posthog.opt_out_capturing();
  }

  consentSubscribers.forEach((subscriber) => subscriber());
}

export function identifyProductAnalyticsUser(
  user: AnalyticsUser,
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (
    config === null ||
    getProductAnalyticsConsent() !== 'accepted' ||
    !posthog.__loaded
  ) {
    return;
  }
  posthog.identify(user.id, {
    account_type: user.isGuest ? 'guest' : 'registered',
  });
}

function webVitalsSampleBucket(id: string): number {
  let hash = 2_166_136_261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 100;
}

/**
 * Chỉ thu Core Web Vitals trên mẫu 10% page-load đã consent. Sampling tất định theo metric id
 * giữ chi phí event hữu hạn mà vẫn đủ dữ liệu p75; không gửi custom hydration noise.
 */
export function captureProductWebVital(
  metric: ProductWebVital,
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (
    config === null ||
    getProductAnalyticsConsent() !== 'accepted' ||
    !posthog.__loaded ||
    !CORE_WEB_VITAL_NAMES.has(metric.name) ||
    webVitalsSampleBucket(metric.id) >= WEB_VITALS_SAMPLE_PERCENT
  ) {
    return;
  }
  posthog.capture('web_vital', {
    metric_name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
  });
}

export function resetProductAnalyticsUser(
  config: ProductAnalyticsConfig | null = productAnalyticsConfig,
): void {
  if (config === null || !posthog.__loaded) return;
  posthog.reset();
}
