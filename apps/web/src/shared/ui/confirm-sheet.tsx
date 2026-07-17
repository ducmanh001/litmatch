'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { cn } from '../lib/cn';
import { confirmStore } from '../lib/confirm-store';

import type { ConfirmOptions } from '../lib/confirm-store';

const CLOSE_ANIMATION_MS = 300;

/**
 * Bottom-sheet xác nhận, mount 1 lần mỗi layout gốc — gọi qua `confirmAction()`.
 * Đúng layouts/web/*.html § lmConfirm()/lmCloseConfirm() nhưng trả Promise<boolean> thay vì callback.
 */
export function ConfirmSheet() {
  const state = useSyncExternalStore(
    confirmStore.subscribe,
    confirmStore.getSnapshot,
    () => null,
  );
  const [rendered, setRendered] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state) {
      setRendered(state.options);
      const raf = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const timeout = setTimeout(() => setRendered(null), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  if (!rendered) return null;

  const close = (confirmed: boolean) => confirmStore.resolve(confirmed);

  return (
    <div className="fixed inset-0 z-[310]">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/50"
        onClick={() => close(false)}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto max-w-[430px] rounded-t-3xl bg-white p-6 pb-8 transition-transform duration-300 dark:bg-surf',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-white/10" />
        <p className="mb-1.5 text-lg font-bold">{rendered.title}</p>
        <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {rendered.message}
        </p>
        {rendered.content}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold dark:bg-surf2"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={cn(
              'flex-1 rounded-2xl py-3 text-sm font-bold text-white',
              rendered.tone === 'danger'
                ? 'bg-rose-500'
                : 'bg-gradient-to-br from-irisl to-irisl',
            )}
          >
            {rendered.actionLabel ?? 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}
