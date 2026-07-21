import { translate } from '../i18n/messages';

import type { Locale } from '../i18n/locale-store';

type AuthorLike = { nickname?: string | null } | string | null | undefined;

/** User data từ API luôn thắng fallback; fallback chỉ dùng khi deploy lệch contract hoặc data cũ. */
export function getUserDisplayName(author: AuthorLike, locale: Locale): string {
  const nickname =
    typeof author === 'string'
      ? author
      : author?.nickname === undefined || author.nickname === null
        ? ''
        : author.nickname;
  const trimmed = nickname.trim();
  if (trimmed !== '') return trimmed;
  return translate(locale, 'user.fallback');
}
