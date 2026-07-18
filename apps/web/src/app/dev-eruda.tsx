'use client';

import Script from 'next/script';

import { env } from '../shared/env';

export function DevEruda() {
  if (env.NEXT_PUBLIC_ENABLE_ERUDA !== 'true') return null;
  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/eruda"
      strategy="afterInteractive"
      onLoad={() => {
        (window as unknown as { eruda?: { init: () => void } }).eruda?.init();
      }}
    />
  );
}
