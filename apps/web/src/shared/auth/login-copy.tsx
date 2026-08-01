'use client';

import { useTranslation } from '../i18n/messages';

export function LoginCopy() {
  const t = useTranslation();
  return (
    <>
      <h1 className="font-display text-2xl font-semibold italic">
        {t('auth.welcome')}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t('auth.welcomeDescription')}
      </p>
    </>
  );
}

export function LoginLegalNotice() {
  const t = useTranslation();
  return (
    <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
      {t('auth.legalNotice')}
    </p>
  );
}
