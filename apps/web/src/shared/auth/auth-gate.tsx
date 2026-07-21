'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { useTranslation } from '../i18n/messages';
import { useSessionStatus } from './use-session';

import type { ReactNode } from 'react';

/**
 * Guard client cho nhóm route (app) — docs/12 § 12.5. Chờ mount xong mới quyết định
 * (tránh hydration mismatch: server snapshot luôn unauthenticated). Ẩn UI không phải
 * bảo mật (docs/13 § 13.11) — enforcement thật ở backend.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const router = useRouter();
  const t = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (status === 'restorable') {
      void apiClient.restoreSession();
    } else if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [mounted, status, router]);

  if (!mounted || status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t('auth.checkingSession')}
      </div>
    );
  }
  return <>{children}</>;
}
