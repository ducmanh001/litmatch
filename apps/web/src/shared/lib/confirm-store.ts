import type { ReactNode } from 'react';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message: string;
  actionLabel?: string;
  tone?: ConfirmTone;
  /** Nội dung tuỳ biến chèn giữa message và action bar — đúng opts.extraHtml ở lmConfirm(). */
  content?: ReactNode;
}

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

let state: ConfirmState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Singleton pub/sub tương đương lmConfirm()/lmCloseConfirm() ở layouts/web/*.html. */
export const confirmStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ConfirmState | null {
    return state;
  },
  resolve(confirmed: boolean): void {
    state?.resolve(confirmed);
    state = null;
    notify();
  },
};

/** Confirm-sheet đáy màn hình, trả Promise<boolean> — dùng thay `if (await confirmAction({...}))`. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state = { options, resolve };
    notify();
  });
}
