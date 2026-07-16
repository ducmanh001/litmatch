export type ThemeColor = 'cyan' | 'warm';
export type ThemeMode = 'dark' | 'light';
export type ThemeValue = `${ThemeColor}-${ThemeMode}`;

export const THEME_STORAGE_KEY = 'litmatch-admin-theme';
export const THEME_VALUES: ThemeValue[] = [
  'cyan-dark',
  'cyan-light',
  'warm-dark',
  'warm-light',
];

function readInitial(): ThemeValue {
  if (typeof document === 'undefined') return 'cyan-dark';
  const root = document.documentElement;
  const color: ThemeColor = root.classList.contains('theme-warm')
    ? 'warm'
    : 'cyan';
  const mode: ThemeMode = root.classList.contains('light') ? 'light' : 'dark';
  return `${color}-${mode}`;
}

function applyToDom(value: ThemeValue): void {
  const [color, mode] = value.split('-') as [ThemeColor, ThemeMode];
  document.documentElement.classList.toggle('theme-warm', color === 'warm');
  document.documentElement.classList.toggle('light', mode === 'light');
}

let current: ThemeValue = readInitial();
const listeners = new Set<() => void>();

/** Singleton theo cùng idiom `tokenStore` (shared/api/client.ts) — useSyncExternalStore, không context. */
export const themeStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ThemeValue {
    return current;
  },
  set(value: ThemeValue): void {
    if (value === current) return;
    current = value;
    applyToDom(value);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // localStorage bị chặn (private mode...) — theme vẫn áp dụng phiên này, không nhớ lần sau.
    }
    listeners.forEach((listener) => listener());
  },
};
