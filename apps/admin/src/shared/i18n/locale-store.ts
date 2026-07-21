import { useSyncExternalStore } from 'react';

export type Locale = 'vi' | 'en';

const LOCALE_STORAGE_COOKIE = 'litmatch-admin.locale';
const DEFAULT_LOCALE: Locale = 'vi';

function localeFromCookie(): Locale {
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${LOCALE_STORAGE_COOKIE}=`))
    ?.split('=', 2)[1];
  return value === 'en' ? 'en' : DEFAULT_LOCALE;
}

let currentLocale = localeFromCookie();
const subscribers = new Set<() => void>();

document.documentElement.lang = currentLocale;

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  document.cookie = `${LOCALE_STORAGE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
  subscribers.forEach((subscriber) => subscriber());
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
