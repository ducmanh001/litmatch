'use client';

import { useTranslation } from '../shared/i18n/messages';

export default function Loading() {
  const t = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      {t('common.loading')}
    </div>
  );
}
