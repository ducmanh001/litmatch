'use client';

import { useState } from 'react';

import { setLocale, useLocale } from '../i18n/locale-store';
import { useTranslation } from '../i18n/messages';
import { cn } from '../lib/cn';
import { ChevronDownIcon, GlobeIcon } from './icons';

type LanguageOption = { code: 'vi' | 'en'; label: string };

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
];

export function LanguageSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = useTranslation();

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t('language.choose')}, ${locale === 'vi' ? 'Tiếng Việt' : 'English'}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-1.5 rounded-full border border-black/5 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-iris/30 dark:border-white/10 dark:bg-surf dark:text-white/80"
      >
        <GlobeIcon width={16} height={16} />
        <span>{locale.toUpperCase()}</span>
        <ChevronDownIcon className={cn('transition', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop bắt click ra ngoài để đóng dropdown — không chặn scroll trang. */}
          <button
            type="button"
            aria-label={t('language.close')}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            aria-label={t('language.list')}
            className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-surf"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.code}
                role="option"
                aria-selected={option.code === locale}
                onClick={() => {
                  setLocale(option.code);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span
                  className={cn(
                    'font-semibold',
                    'text-foreground dark:text-white',
                  )}
                >
                  {option.label}
                </span>
                {option.code === locale && (
                  <span aria-hidden className="text-iris">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
