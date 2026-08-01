'use client';

import Link from 'next/link';

import { useTranslation } from '../shared/i18n/messages';

export default function NotFound() {
  const t = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-semibold">{t('status.notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('status.notFoundDescription')}</p>
      <Link href="/" className="text-primary hover:underline">
        {t('status.goHome')}
      </Link>
    </main>
  );
}
