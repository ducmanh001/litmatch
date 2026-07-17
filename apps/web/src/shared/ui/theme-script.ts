export const THEME_STORAGE_KEY = 'litmatch-theme';

/**
 * Chạy trước hydrate (đặt trong <head>, docs/13 § 13.9) — tránh nháy sai theme khi tải trang.
 * Mặc định hồng/tối (đúng mọi mockup layouts/web/*.html); 'light'/'white' legacy value đều coi
 * là sáng (giá trị lưu trước khi ThemeSwitcher có theme cam vẫn đọc đúng).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='white'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');if(t==='orange'){document.documentElement.dataset.theme='orange';}}}catch(e){document.documentElement.classList.add('dark');}})();`;
