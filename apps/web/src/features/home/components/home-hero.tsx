'use client';

import Link from 'next/link';

import { useTranslation } from '../../../shared/i18n/messages';
import { ArrowUpRightIcon, MicIcon } from '../../../shared/ui/icons';

export function HomeHero() {
  const t = useTranslation();
  const sampleTags = [
    t('home.sampleTagTravel'),
    t('home.sampleTagCoffee'),
    t('home.sampleTagBooks'),
  ];

  return (
    <section className="glow relative isolate overflow-hidden rounded-[2rem] border border-iris/15 bg-card px-6 py-8 shadow-xl shadow-iris/10 sm:px-9 sm:py-10 lg:px-12 xl:grid xl:min-h-[430px] xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-center xl:gap-10 dark:border-white/10 dark:bg-ink dark:shadow-black/20">
      <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full border-[42px] border-white/25 dark:border-white/10" />

      <div className="relative z-10 max-w-2xl">
        <h1 className="font-display mt-5 max-w-2xl text-3xl font-semibold leading-[1.12] text-slate-950 sm:text-4xl lg:text-5xl dark:text-white">
          {t('home.heroLineOne')}
          <span className="block bg-gradient-to-r from-aqual via-irisl to-iris bg-clip-text text-transparent">
            {t('home.heroLineTwo')}
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-white/80">
          {t('home.heroDescription')}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/discovery"
            className="inline-flex items-center gap-2 rounded-full bg-irisl px-5 py-3 text-sm font-bold text-white shadow-lg shadow-iris/30 transition hover:-translate-y-0.5 hover:brightness-105"
          >
            {t('home.nearbyAction')}
            <ArrowUpRightIcon />
          </Link>
          <Link
            href="/matching"
            className="inline-flex items-center gap-2 rounded-full border border-iris/20 bg-white/70 px-5 py-3 text-sm font-bold text-slate-800 backdrop-blur transition hover:border-iris/40 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            {t('home.voiceAction')}
          </Link>
        </div>
        <p className="mt-5 text-xs font-medium text-slate-500 dark:text-white/65">
          {t('home.heroFooter')}
        </p>
      </div>

      <div className="relative z-10 mt-9 flex min-h-[330px] items-center justify-center xl:mt-0 xl:min-h-0">
        <span className="pulsering motion-reduce:[animation:none!important] absolute h-40 w-40 rounded-full border border-iris/35 dark:border-white/20" />
        <span className="pulsering2 motion-reduce:[animation:none!important] absolute h-40 w-40 rounded-full border border-iris/35 dark:border-white/15" />
        <div className="floatslow motion-reduce:[animation:none!important] relative z-10 w-[17.5rem] overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/90 shadow-2xl shadow-iris/20 backdrop-blur dark:border-white/15 dark:bg-surf/95 dark:shadow-black/35">
          <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-irisl to-aqual">
            <span className="font-display text-7xl text-white/90">M</span>
            <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-iris shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
              {t('home.sampleProfile')}
            </span>
            <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              <MicIcon width={13} height={13} />
              {t('home.voicePriority')}
            </span>
          </div>
          <div className="p-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Minh Anh, 27
            </h2>
            <p className="font-mono mt-1 text-[11px] text-slate-500 dark:text-white/60">
              {t('home.sampleLocation')}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-white/80">
              {t('home.sampleBio')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sampleTags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono rounded-full bg-iris/10 px-2.5 py-1 text-[10px] text-irisl dark:bg-white/10 dark:text-white/85"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
