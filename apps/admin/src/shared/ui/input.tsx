import { cn } from '../lib/cn';

import type { InputHTMLAttributes } from 'react';

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-[9px] border border-border bg-muted px-3 text-[13px] text-foreground placeholder:text-dimmer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
