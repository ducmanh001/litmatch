'use client';

import { useEffect, useState } from 'react';

import { cn } from '../lib/cn';
import { THEME_STORAGE_KEY } from './theme-script';

type Theme = 'dark' | 'light';

/** 2 theme (tối mặc định / sáng) — docs/13 § 13.9, đúng mockup layouts/web/*.html (bỏ theme cam). */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );
  }, []);

  const applyTheme = (next: Theme): void => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  };

  return (
    <div
      role="group"
      aria-label="Chọn giao diện màu"
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-border bg-card p-1.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => applyTheme('dark')}
        data-active={theme === 'dark'}
        aria-label="Giao diện tối"
        aria-pressed={theme === 'dark'}
        className="theme-dot h-5 w-5 rounded-full bg-iris"
      />
      <button
        type="button"
        onClick={() => applyTheme('light')}
        data-active={theme === 'light'}
        aria-label="Giao diện sáng"
        aria-pressed={theme === 'light'}
        className="theme-dot h-5 w-5 rounded-full border border-black/10 bg-paper"
      />
    </div>
  );
}
