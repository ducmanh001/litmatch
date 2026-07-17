import { useEffect } from 'react';
import { X } from 'lucide-react';

import { cn } from '../lib/cn';

import type { MouseEvent, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Port từ .modal-overlay/.modal-panel của mockup — đóng bằng Escape + click ra ngoài. */
export function Modal({ open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
        role="dialog"
        aria-modal="true"
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
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
      <h3 className="text-[15px] font-extrabold">{title}</h3>
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
