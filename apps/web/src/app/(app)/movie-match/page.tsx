'use client';

import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { useFriends } from '../../../features/friend-chat/api';
import { FriendPicker } from '../../../features/movie-match/components/friend-picker';

import type { MovieSessionStartedEventData } from '@litmatch/common-dtos/pure';
import type { FriendOption } from '../../../features/movie-match/components/friend-picker';

export default function MovieMatchPage() {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const friends = useFriends();

  // Không có REST nào để tự phát hiện "tôi đang được mời xem chung" (chỉ có
  // GET /movie-match/sessions/:id — phải biết id trước). Với người ĐƯỢC mời (không phải người
  // vừa POST /sessions), event này là CÁCH DUY NHẤT để biết và vào đúng phòng — không chỉ là
  // gợi ý refetch sớm như mọi nơi khác trong app.
  useRealtimeEvent<MovieSessionStartedEventData>(
    RealtimeEvents.MovieSessionStarted,
    (data) => {
      if (data.initiatorUserId !== me?.id) {
        router.push(`/movie-match/${data.sessionId}`);
      }
    },
  );

  const friendOptions: FriendOption[] =
    friends.data?.map((friend) => ({
      userId: friend.profile.id,
      nickname: friend.profile.nickname,
    })) ?? [];

  return (
    <section className="flex min-h-[70vh] flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <Link
          href="/home"
          aria-label="Quay lại"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <p className="text-sm font-bold">Movie Match</p>
        <div className="h-9 w-9" />
      </div>
      <div className="space-y-5 px-5 py-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Xem chung 1 video YouTube với bạn bè, kèm chat trực tiếp.
        </p>
        <FriendPicker
          friends={friendOptions}
          friendsPending={friends.isPending}
          friendsError={friends.isError}
          onCreated={(session) => router.replace(`/movie-match/${session.id}`)}
        />
      </div>
    </section>
  );
}
