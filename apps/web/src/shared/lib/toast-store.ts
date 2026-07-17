export type ToastTone = 'default' | 'warn';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_DURATION_MS = 2600;

let idCounter = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Singleton pub/sub (cùng idiom apps/admin toastStore) — thay cho lmToast() ở layouts/web/*.html. */
export const toastStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ToastItem[] {
    return toasts;
  },
  show(message: string, tone: ToastTone = 'default'): void {
    const id = ++idCounter;
    toasts = [...toasts, { id, message, tone }];
    notify();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, TOAST_DURATION_MS);
  },
};

export function showToast(message: string, tone?: ToastTone): void {
  toastStore.show(message, tone);
}
