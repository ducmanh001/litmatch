'use client';

import { useSyncExternalStore } from 'react';

import { toastStore } from '../lib/toast-store';

const EMPTY: never[] = [];

/**
 * Mount 1 lần mỗi layout gốc (root/(public)/(app)) — `showToast()` từ bất kỳ đâu trong nhánh
 * đó sẽ hiện ở đây. Đúng layouts/web/*.html § lmToastStack.
 */
export function ToastStack() {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    () => EMPTY,
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[300] flex flex-col items-center gap-2 px-4 md:bottom-8">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-lm-toast pointer-events-auto flex max-w-[92%] items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl shadow-black/10 ${
            toast.tone === 'warn'
              ? 'bg-rose-500 text-white'
              : 'bg-ink text-white dark:bg-white dark:text-ink'
          }`}
        >
          <span aria-hidden>{toast.tone === 'warn' ? '⚠️' : '✓'}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
