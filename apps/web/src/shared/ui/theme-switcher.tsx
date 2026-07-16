'use client';

import { useEffect, useState } from 'react';

import { cn } from '../lib/cn';
import { THEME_STORAGE_KEY } from './theme-script';

/** 3 mood màu đúng layouts/web/*.html (setTheme() ở mockup) — 'pink' là mặc định tối, 'orange'
 * cũng nền tối nhưng đổi bảng --iris/--aqua, 'white' là sáng (bỏ class `dark`). */
export type Theme = 'pink' | 'orange' | 'white';

/* Preview tĩnh của từng mood màu (không đổi theo --iris đang active) — đúng style= của 3 nút
 * setTheme() ở mockup. */
const THEME_OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  dotClassName: string;
  dotStyle: { background: string };
}> = [
  {
    value: 'pink',
    label: 'Giao diện hồng',
    dotClassName: '',
    dotStyle: { background: '#e8577c' },
  },
  {
    value: 'orange',
    label: 'Giao diện cam',
    dotClassName: '',
    dotStyle: { background: 'linear-gradient(135deg, #ff5a36, #e08815)' },
  },
  {
    value: 'white',
    label: 'Giao diện trắng',
    dotClassName: 'border border-black/10',
    dotStyle: { background: '#fbf3ef' },
  },
];

/** Event nội bộ tab hiện tại — bắn khi applyTheme() đổi html.dataset/class, để mọi component
 * đang hiển thị theme đang active (ThemeSwitcher, ThemeToggleButton) tự đồng bộ lại, tránh chỉ
 * báo đúng theme cho component vừa gọi applyTheme còn component khác đứng yên tới khi reload. */
export const THEME_CHANGE_EVENT = 'litmatch-theme-change';

export function readCurrentTheme(): Theme {
  if (!document.documentElement.classList.contains('dark')) return 'white';
  return document.documentElement.dataset.theme === 'orange'
    ? 'orange'
    : 'pink';
}

export function applyTheme(next: Theme): void {
  const html = document.documentElement;
  html.classList.toggle('dark', next !== 'white');
  if (next === 'orange') html.dataset.theme = 'orange';
  else delete html.dataset.theme;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('pink');

  useEffect(() => {
    const sync = () => setTheme(readCurrentTheme());
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return (
    <div
      role="group"
      aria-label="Chọn giao diện màu"
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-border bg-card p-1.5',
        className,
      )}
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => applyTheme(option.value)}
          data-active={theme === option.value}
          aria-label={option.label}
          aria-pressed={theme === option.value}
          className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            data-active={theme === option.value}
            style={option.dotStyle}
            className={cn(
              'theme-dot h-4 w-4 rounded-full',
              option.dotClassName,
            )}
          />
        </button>
      ))}
    </div>
  );
}
