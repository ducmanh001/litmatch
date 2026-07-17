'use client';

import { useState } from 'react';

import { cn } from '../lib/cn';
import { ChevronDownIcon, GlobeIcon } from './icons';

type LanguageOption = { code: string; label: string; available: boolean };

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt', available: true },
  { code: 'en', label: 'English', available: false },
];

/**
 * Chọn ngôn ngữ ở header — app hiện chỉ có tiếng Việt, đây là placeholder UI giữ chỗ cho i18n
 * thật sau này (docs/13). Chọn "Tiếng Việt" là no-op, các ngôn ngữ khác disabled + nhãn "Sắp có".
 */
export function LanguageSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Chọn ngôn ngữ, hiện tại Tiếng Việt"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-1.5 rounded-full border border-black/5 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-iris/30 dark:border-white/10 dark:bg-surf dark:text-white/80"
      >
        <GlobeIcon width={16} height={16} />
        <span>VI</span>
        <ChevronDownIcon className={cn('transition', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop bắt click ra ngoài để đóng dropdown — không chặn scroll trang. */}
          <button
            type="button"
            aria-label="Đóng chọn ngôn ngữ"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            aria-label="Ngôn ngữ"
            className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-surf"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <div
                key={option.code}
                role="option"
                aria-selected={option.code === 'vi'}
                aria-disabled={!option.available}
                className="flex items-center justify-between px-3.5 py-2 text-sm"
              >
                <span
                  className={cn(
                    'font-semibold',
                    option.available
                      ? 'text-foreground dark:text-white'
                      : 'text-muted-foreground dark:text-white/45',
                  )}
                >
                  {option.label}
                </span>
                {option.code === 'vi' ? (
                  <span aria-hidden className="text-iris">
                    ✓
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground dark:text-white/45">
                    Sắp có
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
