import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import { cn } from '../lib/cn';

import type { MouseEvent, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialog dùng chung: Escape, focus trap và trả focus về trigger khi đóng. */
export function Modal({ open, onClose, children, labelledBy }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const preferredFocus =
      panel?.querySelector<HTMLElement>('[data-autofocus]');
    const firstFocusable =
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (preferredFocus ?? firstFocusable ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || panel === null) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  function onOverlayClick(e: MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-5 backdrop-blur-[2px]"
      onClick={onOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="max-h-[88vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-border bg-card"
        style={{ boxShadow: 'var(--shadow)', animation: 'modal-in .18s ease' }}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  onClose,
  titleId,
}: {
  title: string;
  onClose: () => void;
  titleId?: string;
}) {
  const generatedId = useId();
  return (
    <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
      <h3 id={titleId ?? generatedId} className="text-[15px] font-extrabold">
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className={cn(
          'flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary',
        )}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="p-5">{children}</div>;
}
