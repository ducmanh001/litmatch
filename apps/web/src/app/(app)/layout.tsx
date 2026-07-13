'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { apiClient, tokenStore } from '../../shared/api/client';
import { AuthGate } from '../../shared/auth/auth-gate';
import {
  connectRealtime,
  disconnectRealtime,
} from '../../shared/realtime/socket';

import type { ReactNode } from 'react';

/**
 * Nav sau login khai 1 chỗ (docs/12 § 12.8 bước 3) — party vẫn là placeholder, thêm link
 * khi route tương ứng tồn tại.
 */
const NAV_ITEMS = [
  { href: '/home', label: 'Trang chủ' },
  { href: '/matching', label: 'Ghép đôi' },
  { href: '/friends', label: 'Bạn bè' },
] as const;

function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();

  // Vùng (app) là vùng realtime: connect khi vào, disconnect khi rời hẳn (logout)
  useEffect(() => {
    connectRealtime();
    return disconnectRealtime;
  }, []);

  const logout = (): void => {
    const refreshToken = tokenStore.getRefreshToken();
    disconnectRealtime();
    tokenStore.setSession(null);
    router.replace('/login');
    if (refreshToken !== null) {
      // Local logout thắng mọi response refresh cũ; revoke server chạy best-effort sau đó.
      void apiClient
        .POST('/api/v1/auth/logout', { body: { refreshToken } })
        .catch(() => undefined);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <nav
            className="flex items-center gap-6"
            aria-label="Điều hướng chính"
          >
            <Link href="/home" className="font-bold text-primary">
              Litmatch
            </Link>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppChrome>{children}</AppChrome>
    </AuthGate>
  );
}
