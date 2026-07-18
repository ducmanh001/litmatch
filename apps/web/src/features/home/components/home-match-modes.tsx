'use client';

import Link from 'next/link';

import { useTranslation } from '../../../shared/i18n/messages';
import {
  ArrowUpRightIcon,
  MatchIcon,
  MicIcon,
  MovieIcon,
  PalmIcon,
} from '../../../shared/ui/icons';
import { HomeSectionHeading } from './home-section-heading';

const MODES = [
  { title: 'Soul Match', Icon: MatchIcon, href: '/matching' },
  { title: 'Voice Match', Icon: MicIcon, href: '/matching' },
  { title: 'Movie Match', Icon: MovieIcon, href: '/movie-match' },
  { title: 'Palm Match', Icon: PalmIcon, href: '/palm-match' },
] as const;

export function HomeMatchModes() {
  const t = useTranslation();
  const descriptions = [
    t('home.modeSoul'),
    t('home.modeVoice'),
    t('home.modeMovie'),
    t('home.modePalm'),
  ];

  return (
    <section className="mt-7">
      <HomeSectionHeading
        eyebrow={t('home.matchEyebrow')}
        title={t('home.matchHeading')}
        action={
          <Link
            href="/matching"
            className="hidden items-center gap-1 rounded-full bg-irisl px-3 py-2 text-xs font-bold text-white transition hover:bg-iris/90 sm:flex"
          >
            {t('home.matchAction')}
            <ArrowUpRightIcon width={14} height={14} />
          </Link>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODES.map(({ title, Icon, href }, index) => (
          <Link
            key={title}
            href={href}
            className="group flex min-h-44 flex-col rounded-2xl border border-black/5 bg-white p-4 transition hover:-translate-y-0.5 sm:p-5 dark:border-white/10 dark:bg-surf dark:text-white"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/10 text-irisl">
              <Icon width={22} height={22} />
            </span>
            <span className="mt-auto flex items-end justify-between gap-2 pt-7">
              <span>
                <span className="block text-sm font-bold sm:text-base">
                  {title}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground sm:text-xs dark:text-white/70">
                  {descriptions[index]}
                </span>
              </span>
              <ArrowUpRightIcon className="mb-0.5 hidden shrink-0 opacity-70 sm:block" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
