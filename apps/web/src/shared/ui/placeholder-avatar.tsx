'use client';

import { useState } from 'react';

import { cn } from '../lib/cn';
import { placeholderAvatarUrl } from '../lib/placeholder-avatar';

/**
 * Ảnh minh hoạ Dicebear (seed = userId, đúng kỹ thuật avatar demo layouts/web/*.html) — nếu
 * mạng chặn/lỗi (CSP, offline, dicebear.com sập) thì rơi về hình tròn màu + chữ cái đầu thay vì
 * icon vỡ, không bao giờ để trống hoàn toàn.
 */
export function PlaceholderAvatar({
  seed,
  alt = '',
  size = 40,
  className,
}: {
  seed: string;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden={alt === ''}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual font-bold text-white',
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {(alt || seed).charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full relative inline-block shrink-0 border-paper dark:border-ink rounded-full">
        <img
          src={placeholderAvatarUrl('Ngoc2')}
          alt={alt}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="w-full h-full rounded-full object-cover bg-surf2"
        />
        {size == 96 ? (
          ''
        ) : (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-paper dark:border-ink" />
        )}
      </div>
    </div>
  );
}
