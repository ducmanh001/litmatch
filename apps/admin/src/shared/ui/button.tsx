import { cva } from 'class-variance-authority';

import { cn } from '../lib/cn';

import type { VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-[12.5px] font-bold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:brightness-110',
        outline:
          'border border-border bg-transparent text-foreground hover:border-primary hover:text-primary',
        ghost: 'bg-transparent text-muted-foreground hover:text-primary',
        destructive:
          'bg-destructive-bg text-destructive hover:bg-destructive/20',
      },
      size: {
        default: 'h-9 px-3.5 py-1.5',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
