'use client';

import Link from 'next/link';

import { useTranslation } from '../../../shared/i18n/messages';
import {
  FeedIcon,
  FriendsIcon,
  PartyIcon,
  VideoIcon,
} from '../../../shared/ui/icons';

const QUICK_LINKS = [
  { href: '/party', Icon: PartyIcon },
  { href: '/feed', Icon: FeedIcon },
  { href: '/friends', Icon: FriendsIcon },
  { href: '/video', Icon: VideoIcon },
] as const;

export function HomeQuickLinks() {
  const t = useTranslation();
  const titles = ['Party', t('nav.feed'), t('nav.friends'), 'Video'];
  const descriptions = [
    t('home.quickPartyDescription'),
    t('home.quickFeedDescription'),
    t('home.quickMessagesDescription'),
    t('home.quickVideoDescription'),
  ];

  return (
    <section className="mt-5 rounded-[1.75rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-surf sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-irisl">
            {t('home.quickEyebrow')}
          </p>
          <h2 className="mt-1 text-base font-bold sm:text-lg">
            {t('home.quickHeading')}
          </h2>
        </div>
        <span className="rounded-full bg-iris/10 px-2.5 py-1 text-[10px] font-bold text-irisl dark:bg-white/10 dark:text-white/75">
          {t('home.quickCount')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {QUICK_LINKS.map(({ href, Icon }, index) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-black/5 bg-slate-50/80 p-3.5 transition hover:-translate-y-0.5 hover:border-iris/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/5 dark:bg-white/5 dark:hover:border-iris/25 dark:hover:bg-white/10"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris/10 text-irisl">
              <Icon width={18} height={18} />
            </span>
            <span className="mt-3 block text-sm font-bold">
              {titles[index]}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground dark:text-white/65">
              {descriptions[index]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
