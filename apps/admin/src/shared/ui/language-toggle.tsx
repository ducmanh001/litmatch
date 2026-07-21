import { Languages } from 'lucide-react';

import { setLocale, useLocale } from '../i18n/locale-store';

/** Locale là preference UI; API client đọc cùng store để gửi Accept-Language. */
export function LanguageToggle() {
  const locale = useLocale();
  const nextLocale = locale === 'vi' ? 'en' : 'vi';
  return (
    <button
      type="button"
      aria-label={`Switch language to ${nextLocale === 'vi' ? 'Vietnamese' : 'English'}`}
      onClick={() => setLocale(nextLocale)}
      className="flex h-[38px] items-center gap-1.5 rounded-[11px] border border-border bg-card px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Languages className="size-4" aria-hidden />
      {locale.toUpperCase()}
    </button>
  );
}
