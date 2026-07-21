'use client';

import { useSyncExternalStore } from 'react';

export type Locale = 'vi' | 'en';

const LOCALE_COOKIE_NAME = 'litmatch-web.locale';
const DEFAULT_LOCALE: Locale = 'vi';

function localeFromCookie(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split('=', 2)[1];
  return value === 'en' ? 'en' : DEFAULT_LOCALE;
}

let currentLocale = localeFromCookie();
const subscribers = new Set<() => void>();

if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLocale;
}

function notify(): void {
  subscribers.forEach((subscriber) => subscriber());
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
  notify();
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (subscriber) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    getLocale,
    () => DEFAULT_LOCALE,
  );
}
