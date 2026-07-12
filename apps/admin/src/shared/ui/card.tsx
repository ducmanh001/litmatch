import { cn } from '../lib/cn';

import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card p-6 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
