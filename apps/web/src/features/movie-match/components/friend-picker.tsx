'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button } from '../../../shared/ui/button';
import { useCreateSession } from '../api';
import { createSessionSchema } from '../create-session-schema';

import type { MovieSessionDto } from '../api';
import type { CreateSessionForm } from '../create-session-schema';

/**
 * Không import type từ `features/friend-chat` (boundary — docs/13 §13.3): route đã tự map
 * `FriendDto[]` sang shape tối giản này trước khi truyền prop xuống.
 */
export interface FriendOption {
  userId: string;
  nickname: string;
}

export function FriendPicker({
  friends,
  friendsPending,
  friendsError,
  onCreated,
}: {
  friends: FriendOption[];
  friendsPending: boolean;
  friendsError: boolean;
  onCreated: (session: MovieSessionDto) => void;
}) {
  const form = useForm<CreateSessionForm>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: { friendUserId: '', videoUrl: '' },
  });
  const createSession = useCreateSession();
  const videoUrl = form.watch('videoUrl');
  // Gợi ý mềm, không chặn submit — server là nơi validate whitelist domain thật.
  const looksLikeYoutubeUrl =
    videoUrl.length === 0 ||
    videoUrl.includes('youtube.com') ||
    videoUrl.includes('youtu.be');

  const message =
    form.formState.errors.friendUserId?.message ??
    form.formState.errors.videoUrl?.message ??
    (isApiError(createSession.error)
      ? createSession.error.message
      : createSession.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit((body) => {
    createSession.mutate(body, {
      onSuccess: (session) => {
        if (session === undefined) return;
        onCreated(session);
      },
    });
  });

  if (friendsPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Đang tải danh sách bạn bè…
      </p>
    );
  }

  if (friendsError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Không tải được danh sách bạn bè.
      </p>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="space-y-2 rounded-2xl border border-black/5 bg-white px-4 py-6 text-center dark:border-white/10 dark:bg-surf">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Movie Match chỉ xem chung được với bạn bè — chưa có ai trong danh sách
          bạn bè cả.
        </p>
        <Link href="/friends" className="text-sm font-bold text-irisl">
          Xem danh sách bạn bè
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <label
          htmlFor="friendUserId"
          className="block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500"
        >
          Xem cùng ai?
        </label>
        <select
          id="friendUserId"
          className="h-12 w-full rounded-xl border border-black/5 bg-white px-4 text-sm outline-none focus:border-irisl dark:border-white/10 dark:bg-surf"
          {...form.register('friendUserId')}
        >
          <option value="">Chọn bạn bè…</option>
          {friends.map((friend) => (
            <option key={friend.userId} value={friend.userId}>
              {friend.nickname}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label
          htmlFor="videoUrl"
          className="block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500"
        >
          Link video YouTube
        </label>
        <input
          id="videoUrl"
          type="text"
          placeholder="https://www.youtube.com/watch?v=…"
          className="h-12 w-full rounded-xl border border-black/5 bg-white px-4 text-sm outline-none focus:border-irisl dark:border-white/10 dark:bg-surf"
          {...form.register('videoUrl')}
        />
        {!looksLikeYoutubeUrl && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Link có vẻ không phải YouTube — vẫn có thể gửi, hệ thống sẽ báo nếu
            link không hợp lệ.
          </p>
        )}
      </div>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={createSession.isPending}
      >
        {createSession.isPending ? 'Đang tạo phiên…' : 'Bắt đầu xem chung'}
      </Button>
    </form>
  );
}
