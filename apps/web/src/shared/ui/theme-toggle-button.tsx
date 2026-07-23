'use client';

import { useEffect, useState } from 'react';

import { useTranslation } from '../i18n/messages';
import { cn } from '../lib/cn';
import { MoonIcon, SunIcon } from './icons';
import {
  applyTheme,
  readCurrentTheme,
  THEME_CHANGE_EVENT,
} from './theme-switcher';

const LAST_DARK_MOOD_KEY = 'litmatch-last-dark-mood';

/**
 * Toggle sáng/tối nhị phân ở header. Bật tối lại thì khôi phục đúng mood tối gần nhất
 * (pink/orange) thay vì luôn mặc định pink. Nghe THEME_CHANGE_EVENT để đồng bộ icon khi theme
 * đổi từ nơi khác (vd nhiều tab cùng mở).
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(true);
  const t = useTranslation();

  useEffect(() => {
    const sync = () => setIsDark(readCurrentTheme() !== 'white');
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const toggle = (): void => {
    if (isDark) {
      const current = readCurrentTheme();
      if (current !== 'white')
        localStorage.setItem(LAST_DARK_MOOD_KEY, current);
      applyTheme('white');
    } else {
      const lastMood = localStorage.getItem(LAST_DARK_MOOD_KEY);
      applyTheme(lastMood === 'orange' ? 'orange' : 'pink');
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
      aria-pressed={isDark}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white text-slate-600 transition hover:border-iris/30 dark:border-white/10 dark:bg-surf dark:text-white/80',
        className,
      )}
    >
      {isDark ? (
        <MoonIcon width={17} height={17} />
      ) : (
        <SunIcon width={17} height={17} />
      )}
    </button>
  );
}
