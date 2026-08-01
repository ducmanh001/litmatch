import { translate } from '../i18n/messages';

import type { Locale } from '../i18n/locale-store';

/** Relative time formatter keeps locale at the call site so it also works outside React. */
export function formatRelativeTime(iso: string, locale: Locale = 'vi'): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return translate(locale, 'common.relative.justNow');
  if (minutes < 60)
    return translate(locale, 'common.relative.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return translate(locale, 'common.relative.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return translate(locale, 'common.relative.yesterday');
  if (days < 7)
    return translate(locale, 'common.relative.days', { count: days });
  return new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US');
}
