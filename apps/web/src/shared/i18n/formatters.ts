import type { Locale } from './locale-store';

const localeCode = (locale: Locale): string =>
  locale === 'vi' ? 'vi-VN' : 'en-US';

/** Use these helpers for product values so numbers/dates follow the selected language. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeCode(locale)).format(value);
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(localeCode(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatCurrency(
  value: number,
  currency: string,
  locale: Locale,
): string {
  return new Intl.NumberFormat(localeCode(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
