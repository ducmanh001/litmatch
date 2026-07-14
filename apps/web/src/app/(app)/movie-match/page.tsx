'use client';

import { RealtimeEvents } from '@litmatch/common-dtos/pure';
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
    <section className="space-y-5 px-5 py-2">
      <h1 className="font-display pb-2 pt-2 text-2xl font-semibold italic">
        Movie Match
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Xem chung 1 video YouTube với bạn bè, kèm chat trực tiếp.
      </p>
      <FriendPicker
        friends={friendOptions}
        friendsPending={friends.isPending}
        friendsError={friends.isError}
        onCreated={(session) => router.replace(`/movie-match/${session.id}`)}
      />
    </section>
  );
}
