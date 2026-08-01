'use client';

import Link from 'next/link';

import { useSessionStatus } from '../../shared/auth/use-session';
import { useTranslation } from '../../shared/i18n/messages';

function useHasSession() {
  return useSessionStatus() !== 'unauthenticated';
}

export function LandingPrimaryCta() {
  const t = useTranslation();
  const hasSession = useHasSession();

  return (
    <Link
      href={hasSession ? '/home' : '/login'}
      className="rounded-full bg-irisl px-7 py-3.5 font-bold text-white shadow-xl shadow-iris/30 transition hover:-translate-y-0.5"
    >
      {hasSession ? t('public.tryNow') : t('landing.start')}
    </Link>
  );
}

export function LandingFinalCta() {
  const t = useTranslation();
  const hasSession = useHasSession();

  return (
    <section className="relative z-10 mx-auto max-w-4xl px-6 py-16 text-center md:py-24">
      <h2 className="font-display mb-5 text-3xl font-semibold md:text-4xl">
        {t(hasSession ? 'landing.ctaTitleAuthenticated' : 'landing.ctaTitle')}
      </h2>
      <p className="mb-8 text-slate-500 dark:text-slate-400">
        {t(
          hasSession
            ? 'landing.ctaDescriptionAuthenticated'
            : 'landing.ctaDescription',
        )}
      </p>
      <Link
        href={hasSession ? '/home' : '/login'}
        className="inline-block rounded-full bg-irisl px-8 py-4 font-bold text-white shadow-xl shadow-iris/30 transition hover:-translate-y-0.5"
      >
        {t('public.tryNow')}
      </Link>
    </section>
  );
}
