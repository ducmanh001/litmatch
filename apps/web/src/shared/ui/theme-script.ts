export const THEME_STORAGE_KEY = 'litmatch-theme';

/**
 * Chạy trước hydrate (đặt trong <head>, docs/13 § 13.9) — tránh nháy sáng/tối khi tải trang.
 * Mặc định tối (đúng mọi mockup layouts/web/*.html), chỉ chuyển sáng nếu người dùng đã chọn.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;
