export type ToastKind = 'default' | 'warn';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_DURATION_MS = 2600;

let idCounter = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Singleton pub/sub (cùng idiom tokenStore/themeStore) — mọi mutation dùng để phản hồi UX. */
export const toastStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ToastItem[] {
    return toasts;
  },
  show(message: string, kind: ToastKind = 'default'): void {
    const id = ++idCounter;
    toasts = [...toasts, { id, message, kind }];
    notify();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, TOAST_DURATION_MS);
  },
};

export function showToast(message: string, kind?: ToastKind): void {
  toastStore.show(message, kind);
}
