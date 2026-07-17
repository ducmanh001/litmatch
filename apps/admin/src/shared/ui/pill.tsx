import { cn } from '../lib/cn';

import type { ReactNode } from 'react';

export type PillVariant =
  'green' | 'red' | 'neutral' | 'accent' | 'gold' | 'urgent';

const PILL_VARIANT_CLASSES: Record<PillVariant, string> = {
  green: 'bg-success-bg text-success',
  red: 'bg-destructive-bg text-destructive',
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-primary-soft text-primary',
  gold: 'bg-gold-bg text-accent',
  urgent:
    'bg-destructive-bg text-destructive text-[10px] uppercase tracking-wide',
};

export function Pill({
  variant,
  className,
  children,
}: {
  variant: PillVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-extrabold',
        PILL_VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
