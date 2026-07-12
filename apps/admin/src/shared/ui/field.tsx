import { cn } from '../lib/cn';

import type { ReactNode } from 'react';

interface FieldProps {
  /** id của input bên trong — label trỏ đúng input (a11y bắt buộc, docs/13 § 13.9). */
  htmlFor: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Khung field chuẩn cho form: label + control + message lỗi (message backend giữ nguyên văn). */
export function Field({
  htmlFor,
  label,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
