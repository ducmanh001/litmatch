'use client';

import Link from 'next/link';

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
    label: 'Quanh đây',
    desc: 'Tìm người gần bạn',
    Icon: DiscoveryIcon,
  },
  {
    href: '/video',
    label: 'Video',
    desc: 'Lướt khoảnh khắc ngắn',
    Icon: VideoIcon,
  },
  {
    href: '/party',
    label: 'Party',
    desc: 'Vào phòng trò chuyện',
    Icon: PartyIcon,
  },
  {
    href: '/feed',
    label: 'Bảng tin',
    desc: 'Xem câu chuyện mới',
    Icon: FeedIcon,
  },
] satisfies ReadonlyArray<{
  href: string;
  label: string;
  desc: string;
  Icon: typeof DiscoveryIcon;
}>;

const sectionLabelClass =
  'mb-2 px-1 text-[11px] font-bold tracking-[0.1em] text-muted-foreground dark:text-white/50';
const rowClass =
  'flex w-full items-center gap-3 px-4 py-3.5 text-left first:rounded-t-2xl last:rounded-b-2xl';
const iconWrapClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-irisl';
const cardListClass =
  'mb-6 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/5 dark:bg-surf';

/** "Mời bạn bè" chưa có mã giới thiệu/referral thật ở backend — chia sẻ thẳng link app, không
 * bịa endpoint. Web Share API khi có (điện thoại), fallback copy clipboard + toast trên desktop. */
function inviteFriends(): void {
  const url = window.location.origin;
  const shareData = {
    title: 'Litmatch',
    text: `Tham gia Litmatch cùng mình: ${url}`,
    url,
  };
  if (navigator.share) {
    navigator.share(shareData).catch(() => undefined);
    return;
  }
  navigator.clipboard
    .writeText(url)
    .then(() => showToast('Đã copy link mời bạn bè'))
    .catch(() => undefined);
}

export function MoreView() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const t = useTranslation();

  return (
    <div className="px-5 pb-4 dark:text-white">
      <PageHeader leading={<BrandMark />} />

      <Link
        href="/profile"
        className="mb-4 flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf"
      >
        <PlaceholderAvatar seed={user?.id ?? 'me'} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {user?.nickname?.trim() || t('user.fallback')}
          </p>
          <p className="text-xs text-muted-foreground dark:text-white/60">
            Xem và chỉnh sửa hồ sơ
          </p>
        </div>
        <ChevronRightIcon className="shrink-0 text-slate-300" />
      </Link>

      <Link
        href="/wallet"
        className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-irisl to-aqual p-4 text-white shadow-lg shadow-iris/30"
      >
        <CrownIcon width={22} height={22} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Nâng cấp Premium</p>
          <p className="text-xs opacity-90">
            Xem ai đã thích bạn, vuốt không giới hạn
          </p>
        </div>
        <ChevronRightIcon className="shrink-0 text-white/80" />
      </Link>

      <p className={sectionLabelClass}>KHÁM PHÁ</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        {EXPLORE_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf"
          >
            <span className={`${iconWrapClass} mb-2`}>
              <item.Icon width={18} height={18} />
            </span>
            <p className="text-sm font-bold">{item.label}</p>
            <p className="text-xs text-muted-foreground dark:text-white/55">
              {item.desc}
            </p>
          </Link>
        ))}
      </div>

      <p className={sectionLabelClass}>TÀI KHOẢN</p>
      <div className={cardListClass}>
        <div className={rowClass}>
          <span className="flex-1 text-sm font-semibold">
            Giao diện sáng/tối
          </span>
          <ThemeToggleButton />
        </div>
        <div className={rowClass}>
          <span className="flex-1 text-sm font-semibold">Ngôn ngữ</span>
          <LanguageSelector />
        </div>
        <Link href="/profile/edit" className={rowClass}>
          <span className={iconWrapClass}>
            <ProfileIcon width={15} height={15} />
          </span>
          <span className="flex-1 text-sm font-semibold">Chỉnh sửa hồ sơ</span>
          <ChevronRightIcon className="shrink-0 text-slate-300" />
        </Link>
        <Link href="/privacy" className={rowClass}>
          <span className={iconWrapClass}>
            <ShieldIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Cài đặt và quyền riêng tư
          </span>
          <ChevronRightIcon className="shrink-0 text-slate-300" />
        </Link>
      </div>

      <p className={sectionLabelClass}>HỖ TRỢ</p>
      <div className={cardListClass}>
        <button type="button" onClick={inviteFriends} className={rowClass}>
          <span className={iconWrapClass}>
            <ShareIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">Mời bạn bè</span>
          <ChevronRightIcon className="shrink-0 text-slate-300" />
        </button>
        <Link href="/help" className={rowClass}>
          <span className={iconWrapClass}>
            <HelpCircleIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Trung tâm trợ giúp
          </span>
          <ChevronRightIcon className="shrink-0 text-slate-300" />
        </Link>
      </div>

      <button
        type="button"
        onClick={logout}
        className="block w-full rounded-2xl border border-black/5 bg-white py-3 text-center text-sm font-bold text-rose-500 dark:border-white/5 dark:bg-surf"
      >
        Đăng xuất
      </button>
    </div>
  );
}
