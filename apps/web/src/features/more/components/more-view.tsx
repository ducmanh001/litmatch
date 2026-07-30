'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useLogout } from '../../../shared/auth/use-logout';
import { useTranslation } from '../../../shared/i18n/messages';
import { showToast } from '../../../shared/lib/toast-store';
import {
  ChevronRightIcon,
  CrownIcon,
  DiscoveryIcon,
  FeedIcon,
  HelpCircleIcon,
  PartyIcon,
  ProfileIcon,
  ShareIcon,
  ShieldIcon,
  VideoIcon,
} from '../../../shared/ui/icons';
import { LanguageSelector } from '../../../shared/ui/language-selector';
import { BrandMark, PageHeader } from '../../../shared/ui/page-header';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { ThemeToggleButton } from '../../../shared/ui/theme-toggle-button';

const EXPLORE_ITEMS = [
  {
    href: '/discovery',
    labelKey: 'more.explore.discovery.label',
    descriptionKey: 'more.explore.discovery.description',
    Icon: DiscoveryIcon,
  },
  {
    href: '/video',
    labelKey: 'more.explore.video.label',
    descriptionKey: 'more.explore.video.description',
    Icon: VideoIcon,
  },
  {
    href: '/party',
    labelKey: 'more.explore.party.label',
    descriptionKey: 'more.explore.party.description',
    Icon: PartyIcon,
  },
  {
    href: '/feed',
    labelKey: 'more.explore.feed.label',
    descriptionKey: 'more.explore.feed.description',
    Icon: FeedIcon,
  },
] as const;

const ROW_CLASS =
  'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-black/[0.025] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris dark:hover:bg-white/5';
const ICON_CONTAINER_CLASS =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-irisl';
const CARD_LIST_CLASS =
  'divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/5 dark:bg-surf';
const CARD_LINK_CLASS =
  'rounded-2xl border border-black/5 bg-white p-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris dark:border-white/5 dark:bg-surf';

interface SectionHeadingProps {
  id: string;
  children: ReactNode;
}

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className="mb-2 px-1 text-[11px] font-bold tracking-[0.1em] text-muted-foreground dark:text-white/50"
    >
      {children}
    </h2>
  );
}

interface MenuLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
}

function MenuLink({ href, icon, label }: MenuLinkProps) {
  return (
    <Link href={href} className={ROW_CLASS}>
      <span className={ICON_CONTAINER_CLASS} aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <ChevronRightIcon className="shrink-0 text-slate-300" />
    </Link>
  );
}

function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function MoreView() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const t = useTranslation();
  const [isSharing, setIsSharing] = useState(false);

  const inviteFriends = async (): Promise<void> => {
    const url = window.location.origin;
    const shareData = {
      title: t('more.invite.shareTitle'),
      text: t('more.invite.shareText'),
      url,
    };

    setIsSharing(true);
    try {
      if (navigator.share !== undefined) {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (isShareCancellation(error)) {
            return;
          }
        }
      }

      await navigator.clipboard.writeText(url);
      showToast(t('more.invite.copied'));
    } catch {
      showToast(t('more.invite.copyFailed'), 'warn');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="px-5 dark:text-white">
      <PageHeader leading={<BrandMark />} />

      <Link
        href="/profile"
        className="mb-4 flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 transition-colors hover:bg-black/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris dark:border-white/5 dark:bg-surf dark:hover:bg-white/5"
      >
        <PlaceholderAvatar seed={user?.id ?? 'me'} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {user?.nickname?.trim() || t('user.fallback')}
          </span>
          <span className="block text-xs text-muted-foreground dark:text-white/60">
            {t('more.profile.description')}
          </span>
        </span>
        <ChevronRightIcon className="shrink-0 text-slate-300" />
      </Link>

      <Link
        href="/wallet"
        className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-irisl to-aqual p-4 text-white shadow-lg shadow-iris/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2"
      >
        <CrownIcon width={22} height={22} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {t('more.premium.title')}
          </span>
          <span className="block text-xs opacity-90">
            {t('more.premium.description')}
          </span>
        </span>
        <ChevronRightIcon className="shrink-0 text-white/80" />
      </Link>

      <section aria-labelledby="more-explore-heading" className="mb-6">
        <SectionHeading id="more-explore-heading">
          {t('more.section.explore')}
        </SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          {EXPLORE_ITEMS.map(({ href, labelKey, descriptionKey, Icon }) => (
            <Link key={href} href={href} className={CARD_LINK_CLASS}>
              <span
                className={`${ICON_CONTAINER_CLASS} mb-2`}
                aria-hidden="true"
              >
                <Icon width={18} height={18} />
              </span>
              <span className="block text-sm font-bold">{t(labelKey)}</span>
              <span className="block text-xs text-muted-foreground dark:text-white/55">
                {t(descriptionKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="more-account-heading" className="mb-6">
        <SectionHeading id="more-account-heading">
          {t('more.section.account')}
        </SectionHeading>
        <div className={CARD_LIST_CLASS}>
          <div className={ROW_CLASS}>
            <span className="flex-1 text-sm font-semibold">
              {t('more.account.theme')}
            </span>
            <ThemeToggleButton />
          </div>
          <div className={ROW_CLASS}>
            <span className="flex-1 text-sm font-semibold">
              {t('more.account.language')}
            </span>
            <LanguageSelector />
          </div>
          <MenuLink
            href="/profile/edit"
            icon={<ProfileIcon width={15} height={15} />}
            label={t('more.account.editProfile')}
          />
          <MenuLink
            href="/privacy"
            icon={<ShieldIcon />}
            label={t('more.account.privacy')}
          />
        </div>
      </section>

      <section aria-labelledby="more-support-heading" className="mb-6">
        <SectionHeading id="more-support-heading">
          {t('more.section.support')}
        </SectionHeading>
        <div className={CARD_LIST_CLASS}>
          <button
            type="button"
            onClick={() => void inviteFriends()}
            disabled={isSharing}
            aria-busy={isSharing}
            className={`${ROW_CLASS} disabled:cursor-wait disabled:opacity-60`}
          >
            <span className={ICON_CONTAINER_CLASS} aria-hidden="true">
              <ShareIcon />
            </span>
            <span className="flex-1 text-sm font-semibold">
              {isSharing
                ? t('more.invite.sharing')
                : t('more.support.inviteFriends')}
            </span>
            <ChevronRightIcon className="shrink-0 text-slate-300" />
          </button>
          <MenuLink
            href="/help"
            icon={<HelpCircleIcon />}
            label={t('more.support.helpCenter')}
          />
        </div>
      </section>

      <button
        type="button"
        onClick={logout}
        className="block w-full rounded-2xl border border-black/5 bg-white py-3 text-center text-sm font-bold text-rose-500 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-white/5 dark:bg-surf dark:hover:bg-rose-950/20"
      >
        {t('more.logout')}
      </button>
    </div>
  );
}
