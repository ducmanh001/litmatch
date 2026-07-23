'use client';

import Link from 'next/link';
import { createElement } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useTranslation } from '../../../shared/i18n/messages';
import { useLogout } from '../../../shared/auth/use-logout';
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
    descKey: 'more.explore.discovery.description',
    Icon: DiscoveryIcon,
  },
  {
    href: '/video',
    labelKey: 'more.explore.video.label',
    descKey: 'more.explore.video.description',
    Icon: VideoIcon,
  },
  {
    href: '/party',
    labelKey: 'more.explore.party.label',
    descKey: 'more.explore.party.description',
    Icon: PartyIcon,
  },
  {
    href: '/feed',
    labelKey: 'more.explore.feed.label',
    descKey: 'more.explore.feed.description',
    Icon: FeedIcon,
  },
] as const;

const sectionLabelClass =
  'mb-2 px-1 text-[11px] font-bold tracking-[0.1em] text-muted-foreground dark:text-white/50';
const rowClass =
  'flex w-full items-center gap-3 px-4 py-3.5 text-left first:rounded-t-2xl last:rounded-b-2xl';
const iconWrapClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-irisl';
const cardListClass =
  'mb-6 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/5 dark:bg-surf';
const h = createElement;

export function MoreView() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const t = useTranslation();

  /** "Mời bạn bè" chưa có mã giới thiệu/referral thật ở backend — chia sẻ thẳng link app, không
   * bịa endpoint. Web Share API khi có (điện thoại), fallback copy clipboard + toast trên desktop. */
  const inviteFriends = (): void => {
    const url = window.location.origin;
    const shareData = {
      title: t('more.invite.shareTitle'),
      text: `${t('more.invite.shareText')} ${url}`,
      url,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => undefined);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => showToast(t('more.invite.copied')))
      .catch(() => undefined);
  };

  return h(
    'div',
    { className: 'px-5 dark:text-white' },
    h(PageHeader, { leading: h(BrandMark) }),
    h(
      Link,
      {
        href: '/profile',
        className:
          'mb-4 flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf',
      },
      h(PlaceholderAvatar, { seed: user?.id ?? 'me', size: 48 }),
      h(
        'div',
        { className: 'min-w-0 flex-1' },
        h(
          'p',
          { className: 'truncate text-sm font-bold' },
          user?.nickname?.trim() || t('user.fallback'),
        ),
        h(
          'p',
          { className: 'text-xs text-muted-foreground dark:text-white/60' },
          t('more.profile.description'),
        ),
      ),
      h(ChevronRightIcon, { className: 'shrink-0 text-slate-300' }),
    ),
    h(
      Link,
      {
        href: '/wallet',
        className:
          'mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-irisl to-aqual p-4 text-white shadow-lg shadow-iris/30',
      },
      h(CrownIcon, { width: 22, height: 22 }),
      h(
        'div',
        { className: 'min-w-0 flex-1' },
        h('p', { className: 'text-sm font-bold' }, t('more.premium.title')),
        h(
          'p',
          { className: 'text-xs opacity-90' },
          t('more.premium.description'),
        ),
      ),
      h(ChevronRightIcon, { className: 'shrink-0 text-white/80' }),
    ),
    h('p', { className: sectionLabelClass }, t('more.section.explore')),
    h(
      'div',
      { className: 'mb-6 grid grid-cols-2 gap-3' },
      ...EXPLORE_ITEMS.map((item) =>
        h(
          Link,
          {
            key: item.href,
            href: item.href,
            className:
              'rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf',
          },
          h(
            'span',
            { className: `${iconWrapClass} mb-2` },
            h(item.Icon, { width: 18, height: 18 }),
          ),
          h('p', { className: 'text-sm font-bold' }, t(item.labelKey)),
          h(
            'p',
            { className: 'text-xs text-muted-foreground dark:text-white/55' },
            t(item.descKey),
          ),
        ),
      ),
    ),
    h('p', { className: sectionLabelClass }, t('more.section.account')),
    h(
      'div',
      { className: cardListClass },
      h(
        'div',
        { className: rowClass },
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.account.theme'),
        ),
        h(ThemeToggleButton),
      ),
      h(
        'div',
        { className: rowClass },
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.account.language'),
        ),
        h(LanguageSelector),
      ),
      h(
        Link,
        { href: '/profile/edit', className: rowClass },
        h(
          'span',
          { className: iconWrapClass },
          h(ProfileIcon, { width: 15, height: 15 }),
        ),
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.account.editProfile'),
        ),
        h(ChevronRightIcon, { className: 'shrink-0 text-slate-300' }),
      ),
      h(
        Link,
        { href: '/privacy', className: rowClass },
        h('span', { className: iconWrapClass }, h(ShieldIcon)),
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.account.privacy'),
        ),
        h(ChevronRightIcon, { className: 'shrink-0 text-slate-300' }),
      ),
    ),
    h('p', { className: sectionLabelClass }, t('more.section.support')),
    h(
      'div',
      { className: cardListClass },
      h(
        'button',
        { type: 'button', onClick: inviteFriends, className: rowClass },
        h('span', { className: iconWrapClass }, h(ShareIcon)),
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.support.inviteFriends'),
        ),
        h(ChevronRightIcon, { className: 'shrink-0 text-slate-300' }),
      ),
      h(
        Link,
        { href: '/help', className: rowClass },
        h('span', { className: iconWrapClass }, h(HelpCircleIcon)),
        h(
          'span',
          { className: 'flex-1 text-sm font-semibold' },
          t('more.support.helpCenter'),
        ),
        h(ChevronRightIcon, { className: 'shrink-0 text-slate-300' }),
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        onClick: logout,
        className:
          'block w-full rounded-2xl border border-black/5 bg-white py-3 text-center text-sm font-bold text-rose-500 dark:border-white/5 dark:bg-surf',
      },
      t('more.logout'),
    ),
  );
}
