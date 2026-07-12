import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

/** Gộp className có xử lý conflict Tailwind — chuẩn duy nhất, không nối chuỗi tay. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
