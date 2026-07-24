'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useCurrentUser } from '../auth/use-current-user';
import {
  getProductAnalyticsConsent,
  identifyProductAnalyticsUser,
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

  // 1. Tự động chuyển quyền consent thành 'accepted' ngay khi vào app
  useEffect(() => {
    if (consent !== 'accepted') {
      setProductAnalyticsConsent('accepted');
    }
  }, [consent]);

  // 2. Định danh người dùng khi đã có profile
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
