import { THEME_STORAGE_KEY } from './theme-script';

/** 'pink' là mặc định tối, 'orange' cũng nền tối nhưng đổi bảng --iris/--aqua, 'white' là sáng
 * (bỏ class `dark`) — không còn UI 3-mood chọn tay (đã bỏ ThemeSwitcher), chỉ còn nhị phân
 * sáng/tối qua ThemeToggleButton, mood tối khôi phục theo `LAST_DARK_MOOD_KEY`. */
export type Theme = 'pink' | 'orange' | 'white';

/** Event nội bộ tab hiện tại — bắn khi applyTheme() đổi html.dataset/class, để mọi component
 * đang hiển thị theme đang active (ThemeToggleButton) tự đồng bộ lại, tránh chỉ báo đúng theme
 * cho component vừa gọi applyTheme còn component khác đứng yên tới khi reload. */
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
