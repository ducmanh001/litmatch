'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useIsAuthenticated } from './use-session';

import type { ReactNode } from 'react';

/**
 * Guard client cho nhóm route (app) — docs/12 § 12.5. Chờ mount xong mới quyết định
 * (tránh hydration mismatch: server snapshot luôn unauthenticated). Ẩn UI không phải
 * bảo mật (docs/13 § 13.11) — enforcement thật ở backend.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace('/login');
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }
  return <>{children}</>;
}
