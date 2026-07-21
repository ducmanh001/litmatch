'use client';

import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useTranslation } from '../../../shared/i18n/messages';
import { ArrowUpRightIcon, DiscoveryIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { HomeHero } from './home-hero';
import { HomeMatchModes } from './home-match-modes';
import { HomeQuickLinks } from './home-quick-links';
import { HomeSectionHeading } from './home-section-heading';

import type { ReactNode } from 'react';

/** Dashboard sau đăng nhập; route truyền slot dữ liệu Party để giữ boundary giữa feature. */
export function HomeDashboard({ trendingRooms }: { trendingRooms: ReactNode }) {
  const { data: user } = useCurrentUser();
  const t = useTranslation();

  return (
    <div className="mx-auto w-full px-5 pb-4 dark:text-white">
      <PageHeader
        leading={
          <Link
            href="/profile"
            className="flex min-w-0 items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlaceholderAvatar
              seed={user?.id ?? 'me'}
              size={46}
              className="shrink-0 border-2 border-iris/30"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground dark:text-white/65">
                {t('home.welcome')}
              </p>
              <p className="truncate text-sm font-bold">
                {user?.nickname?.trim() || t('user.fallback')}
              </p>
            </div>
          </Link>
        }
      />

      <HomeHero />
      <HomeQuickLinks />
      <HomeMatchModes />

      <div className="mt-7 grid gap-5 lg:grid-cols-12">
        <section className="min-w-0 overflow-hidden rounded-[1.75rem] border border-black/5 bg-white lg:col-span-8 dark:border-white/10 dark:bg-surf">
          <div className="p-5 pb-4">
            <HomeSectionHeading
              eyebrow={t('home.roomsEyebrow')}
              title={t('home.roomsHeading')}
              action={
                <Link
                  href="/party"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-irisl px-3 py-2 text-xs font-bold text-white transition hover:bg-iris/90"
                >
                  {t('home.viewAll')}
                  <ArrowUpRightIcon width={14} height={14} />
                </Link>
              }
            />
          </div>
          {trendingRooms}
        </section>

        <Link
          href="/discovery"
          className="group relative flex min-h-60 overflow-hidden rounded-[1.75rem] border border-black/5 bg-white p-6 lg:col-span-4 dark:border-white/10 dark:bg-surf"
        >
          <div className="relative flex w-full flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iris/10 text-irisl">
              <DiscoveryIcon width={20} height={20} />
            </span>
            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-irisl">
              {t('home.discoveryEyebrow')}
            </p>
            <h2 className="font-display mt-1 max-w-xs text-2xl font-semibold leading-tight">
              {t('home.discoveryHeading')}
            </h2>
            <div className="mt-auto flex items-end justify-between gap-4 pt-5">
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm dark:text-white/70">
                {t('home.discoveryDescription')}
              </p>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-irisl text-white transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:bg-iris/90">
                <ArrowUpRightIcon />
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
