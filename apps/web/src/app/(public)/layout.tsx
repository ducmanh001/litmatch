'use client';

import Link from 'next/link';

import { useSessionStatus } from '../../shared/auth/use-session';
import { ConfirmSheet } from '../../shared/ui/confirm-sheet';
import { LogoMark } from '../../shared/ui/icons';
import { LanguageSelector } from '../../shared/ui/language-selector';
import { ThemeToggleButton } from '../../shared/ui/theme-toggle-button';
import { ToastStack } from '../../shared/ui/toast-stack';
import { useTranslation } from '../../shared/i18n/messages';

import type { ReactNode } from 'react';

/** Layout vùng công khai (SSR/SEO — docs/12 § 12.5): header marketing + footer, đúng layouts/web/index.html. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const sessionStatus = useSessionStatus();
  const hasSession = sessionStatus !== 'unauthenticated';
  return (
    <div className="relative">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-paper/85 backdrop-blur dark:border-white/5 dark:bg-ink/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-display flex items-center gap-2 text-xl font-semibold italic text-iris dark:text-irisl"
          >
            <LogoMark />
            Litmatch
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex dark:text-slate-400">
            <a
              href="/#features"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              {t('public.features')}
            </a>
            <a
              href="/#how"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              {t('public.howItWorks')}
            </a>
            <Link
              href="/community-guidelines"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              {t('public.community')}
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {hasSession ? (
              <Link
                href="/home"
                className="rounded-full bg-irisl px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-iris/30"
              >
                {t('nav.home')}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-iris sm:block dark:text-slate-300 dark:hover:text-irisl"
                >
                  {t('public.signIn')}
                </Link>
                <Link
                  href="/login"
                  className="hidden rounded-full bg-irisl px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-iris/30 sm:inline-flex"
                >
                  {t('public.signUp')}
                </Link>
              </>
            )}
            <ThemeToggleButton />
            <LanguageSelector />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="relative z-10 border-t border-black/5 dark:border-white/5">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="font-display mb-3 text-xl italic text-iris dark:text-irisl">
              Litmatch
            </p>
            <p className="max-w-[220px] text-sm text-slate-500 dark:text-slate-400">
              {t('public.tagline')}
            </p>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">{t('public.product')}</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a
                  href="/#features"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.features')}
                </a>
              </li>
              <li>
                <Link
                  href="/features"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.explore')}
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.howItWorks')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">{t('public.company')}</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <Link
                  href="/about"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.about')}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.careers')}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.contact')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">{t('public.legal')}</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <Link
                  href="/terms"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.terms')}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy-policy"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  href="/community-guidelines"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  {t('public.safety')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-black/5 dark:border-white/5">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Litmatch
          </div>
        </div>
      </footer>
      <ToastStack />
      <ConfirmSheet />
    </div>
  );
}
