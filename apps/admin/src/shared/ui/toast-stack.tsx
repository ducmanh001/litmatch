import { useSyncExternalStore } from 'react';

import { cn } from '../lib/cn';
import { toastStore } from '../lib/toast-store';

const EMPTY: never[] = [];

/** Mount 1 lần ở app shell — `showToast()` từ bất kỳ đâu sẽ hiện ở đây. */
export function ToastStack() {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    () => EMPTY,
  );

  return (
    <div className="fixed bottom-[22px] right-[22px] z-[200] flex max-w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2.5 rounded-[11px] border border-border bg-card px-4 py-3 text-[12.5px] font-bold text-foreground"
          style={{
            boxShadow: 'var(--shadow)',
            animation: 'toast-in .22s ease',
          }}
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              toast.kind === 'warn' ? 'bg-destructive' : 'bg-success',
            )}
            aria-hidden
          />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
