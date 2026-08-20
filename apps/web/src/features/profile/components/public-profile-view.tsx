'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import {
  useFollowProfile,
  useOpenProfileConversation,
  useProfileActions,
  useProfileGiftCatalog,
  usePublicPresence,
  usePublicProfile,
  useSendProfileGift,
} from '../api';
import { ProfilePostsGrid } from './profile-posts-grid';

import type { PublicProfileDto } from '../api';

export function PublicProfileView({ userId }: { userId: string }) {
  const router = useRouter();
  const profile = usePublicProfile(userId);
  const presence = usePublicPresence(userId);
  const actions = useProfileActions(userId);
  const followProfile = useFollowProfile(userId);
  const openConversation = useOpenProfileConversation(userId);
  const sendProfileGift = useSendProfileGift(userId);
  const giftCatalog = useProfileGiftCatalog(
    actions.data?.requiresGift === true,
  );
  const { key: giftIdempotencyKey, resetKey } = useIdempotencyKey();

  if (profile.isPending) {
    return (
      <div className="space-y-4 px-4" aria-label="Đang tải hồ sơ">
        <div className="h-44 animate-pulse rounded-[2rem] bg-iris/10" />
        <div className="h-52 animate-pulse rounded-[2rem] bg-white dark:bg-surf" />
      </div>
    );
  }

  if (profile.error !== null) {
    return (
      <p
        role="alert"
        className="mx-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-400/10 dark:text-rose-200"
      >
        {isApiError(profile.error)
          ? profile.error.message
          : 'Không thể tải hồ sơ.'}
      </p>
    );
  }

  const profileData = profile.data;
  if (profileData === undefined) return null;

  const interests = profileData.interests ?? [];
  const isOnline = presence.data?.isOnline === true;
  const isFollowing = actions.data?.isFollowing === true;
  const requiresGift = actions.data?.requiresGift === true;
  const actionsUnavailable = actions.data === undefined || actions.isError;
  const isFollowPending = followProfile.isPending || actions.isPending;
  const isMessagePending = openConversation.isPending;

  const openChat = () => {
    if (actionsUnavailable || requiresGift) return;

    openConversation.mutate(undefined, {
      onSuccess: () => router.push(`/chat/${profileData.id}`),
      onError: (error) =>
        showToast(
          isApiError(error)
            ? error.message
            : 'Không thể mở cuộc trò chuyện lúc này.',
          'warn',
        ),
    });
  };

  const toggleFollow = () => {
    if (actions.data === undefined) return;

    followProfile.mutate(!isFollowing, {
      onSuccess: (result) =>
        showToast(
          result?.following === true ? 'Đã theo dõi hồ sơ.' : 'Đã bỏ theo dõi.',
        ),
      onError: (error) =>
        showToast(
          isApiError(error)
            ? error.message
            : 'Không thể cập nhật theo dõi lúc này.',
          'warn',
        ),
    });
  };

  const sendGiftToOpenChat = (giftId: string, giftName: string) => {
    sendProfileGift.mutate(
      { giftId, idempotencyKey: giftIdempotencyKey },
      {
        onSuccess: () => {
          resetKey();
          showToast(`Đã tặng ${giftName}. Chat đã được mở.`);
          router.push(`/chat/${profileData.id}`);
        },
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Không thể tặng quà.',
            'warn',
          ),
      },
    );
  };

  return (
    <div className="-mt-6 overflow-hidden pb-8">
      <section className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-irisl via-iris to-aqual px-5 pb-24 pt-5 text-white">
        <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-rose-300/20 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <Link
            href="/friends"
            aria-label="Quay lại"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/15 text-2xl backdrop-blur transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ‹
          </Link>
          <span className="rounded-full border border-white/20 bg-black/10 px-3 py-1.5 text-[10px] font-extrabold tracking-[0.18em] text-white/90 backdrop-blur">
            HỒ SƠ ĐỐI PHƯƠNG
          </span>
          <span aria-hidden className="h-10 w-10" />
        </div>
        <div className="relative mt-8">
          <p className="text-sm font-semibold text-white/75">
            Một người thú vị đang ở đây
          </p>
          <h1 className="font-display mt-1 max-w-[17rem] text-3xl font-semibold leading-tight italic">
            Kết nối thật, bắt đầu thật tự nhiên.
          </h1>
        </div>
      </section>

      <div className="relative -mt-16 space-y-4 px-4">
        <section className="rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-xl shadow-iris/10 backdrop-blur dark:border-white/10 dark:bg-surf/95 dark:shadow-black/20">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0 rounded-full bg-gradient-to-br from-aqua to-irisl p-1 shadow-lg shadow-iris/25">
              <PlaceholderAvatar
                seed={profileData.id}
                alt={profileData.nickname}
                size={88}
                className="border-4 border-white dark:border-surf"
              />
              <span
                className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white dark:border-surf ${
                  isOnline ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                aria-label={isOnline ? 'Đang hoạt động' : 'Đang offline'}
              />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display truncate text-2xl font-semibold italic text-foreground">
                  {profileData.nickname}
                </h2>
                {isOnline && (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                    ONLINE
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground dark:text-white/60">
                {genderLabel(profileData.gender)}
              </p>
              <p className="mt-2 break-all text-[11px] font-medium text-muted-foreground/80 dark:text-white/45">
                ID hồ sơ · {profileData.id}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isFollowPending || actionsUnavailable}
              onClick={toggleFollow}
              className={`rounded-2xl px-4 py-3.5 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris disabled:cursor-not-allowed disabled:opacity-50 ${
                isFollowing
                  ? 'border border-iris/25 bg-iris/10 text-irisl dark:bg-iris/15 dark:text-white'
                  : 'bg-gradient-to-r from-irisl to-iris text-white shadow-md shadow-iris/20 hover:brightness-105'
              }`}
            >
              {isFollowing ? '✓ Đang theo dõi' : '♡ Theo dõi'}
            </button>
            <button
              type="button"
              disabled={isMessagePending || actionsUnavailable || requiresGift}
              onClick={openChat}
              className="rounded-2xl bg-foreground px-4 py-3.5 text-sm font-extrabold text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-500 dark:text-white"
            >
              {isMessagePending
                ? 'Đang mở…'
                : requiresGift
                  ? 'Tặng quà để chat'
                  : '💬 Nhắn tin'}
            </button>
          </div>

          {actions.isError && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
              Chưa tải được trạng thái tương tác. Bạn có thể thử lại sau.
            </p>
          )}
          {!actions.isError && !requiresGift && (
            <p className="mt-3 text-center text-xs text-muted-foreground dark:text-white/55">
              {actions.data?.messageAvailable === true
                ? 'Hai bạn đã có một cuộc trò chuyện riêng.'
                : 'Nhắn tin trực tiếp từ hồ sơ, không cần chờ đồng ý.'}
            </p>
          )}
        </section>

        <section className="rounded-[1.75rem] border border-iris/10 bg-card p-4 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-surf">
          <div className="grid grid-cols-2 divide-x divide-iris/10 dark:divide-white/10">
            <SocialStat
              value={actions.data?.followerCount}
              label="Người theo dõi"
            />
            <SocialStat
              value={actions.data?.followingCount}
              label="Đang theo dõi"
            />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-iris/10 bg-card p-5 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-surf">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-irisl">
                ABOUT THIS PERSON
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-foreground">
                Thông tin công khai
              </h2>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-iris/15 to-aqua/20 text-lg text-irisl">
              ✦
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ProfileDetail
              label="Giới tính"
              value={genderLabel(profileData.gender)}
            />
            <ProfileDetail
              label="Trạng thái"
              value={isOnline ? 'Đang hoạt động' : 'Đang offline'}
              accent={isOnline}
            />
          </div>

          <div className="mt-4 rounded-2xl bg-gradient-to-r from-iris/[0.08] to-aqua/[0.08] p-4 dark:from-iris/10 dark:to-aqua/10">
            <p className="text-xs font-extrabold text-foreground">Sở thích</p>
            {interests.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-iris/15 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-irisl dark:border-white/10 dark:bg-white/5 dark:text-white/85"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground dark:text-white/55">
                Người này chưa thêm sở thích công khai.
              </p>
            )}
          </div>
        </section>

        {requiresGift && (
          <section className="rounded-[1.75rem] border border-amber-300/50 bg-gradient-to-br from-amber-50 to-rose-50 p-5 dark:border-amber-200/20 dark:from-amber-400/10 dark:to-rose-400/10">
            <div className="flex gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm dark:bg-surf2">
                🎁
              </span>
              <div>
                <h2 className="font-extrabold text-foreground">
                  Mở khóa cuộc trò chuyện
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/70">
                  Hồ sơ này đang nhận được nhiều sự quan tâm. Tặng một món quà
                  để bắt đầu cuộc trò chuyện riêng tư.
                </p>
              </div>
            </div>
            {giftCatalog.isPending && (
              <p className="mt-4 text-xs text-muted-foreground">
                Đang tải danh sách quà…
              </p>
            )}
            {giftCatalog.data !== undefined && giftCatalog.data.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {giftCatalog.data.map((gift) => (
                  <button
                    key={gift.id}
                    type="button"
                    disabled={sendProfileGift.isPending}
                    onClick={() => sendGiftToOpenChat(gift.id, gift.name)}
                    className="flex min-w-24 flex-col items-center gap-1 rounded-2xl border border-white bg-white px-3 py-3 text-[11px] font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 dark:border-white/10 dark:bg-surf2"
                  >
                    <span aria-hidden className="text-xl">
                      🎁
                    </span>
                    <span className="max-w-20 truncate">{gift.name}</span>
                    <span className="text-sky-600 dark:text-diamond">
                      {gift.priceDiamond} 💎
                    </span>
                  </button>
                ))}
              </div>
            )}
            {giftCatalog.data?.length === 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Hiện chưa có quà để mở chat.
              </p>
            )}
          </section>
        )}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-surf">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-irisl">
                RECENT ACTIVITY
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-foreground">
                Góc nhỏ của {profileData.nickname}
              </h2>
            </div>
            <span className="text-xl" aria-hidden>
              ☼
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground dark:text-white/60">
            Những bài viết công khai gần đây của người này.
          </p>
          <div className="mt-4">
            <ProfilePostsGrid userId={profileData.id} variant="feed" />
          </div>
        </section>
      </div>
    </div>
  );
}

function ProfileDetail({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-background/70 px-3 py-3 dark:border-white/10 dark:bg-surf2/50">
      <p className="text-[10px] font-semibold text-muted-foreground dark:text-white/55">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-extrabold ${accent ? 'text-emerald-500' : 'text-foreground'}`}
      >
        {value}
      </p>
    </div>
  );
}

function SocialStat({
  value,
  label,
}: {
  value: number | undefined;
  label: string;
}) {
  return (
    <div className="px-3 text-center first:pl-1 last:pr-1">
      <p className="text-xl font-black tracking-tight text-foreground">
        {value === undefined ? '—' : value.toLocaleString('vi-VN')}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground dark:text-white/60">
        {label}
      </p>
    </div>
  );
}

function genderLabel(gender: PublicProfileDto['gender']): string {
  if (gender === 'male') return 'Nam';
  if (gender === 'female') return 'Nữ';
  if (gender === 'other') return 'Giới tính khác';
  return 'Không công khai giới tính';
}
