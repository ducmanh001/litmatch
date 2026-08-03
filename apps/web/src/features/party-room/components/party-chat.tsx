'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useCallback, useMemo, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { useRoomComments, useSendRoomComment } from '../api';

import type { FormEvent } from 'react';
import type { PartyCommentCreatedEventData } from '@litmatch/common-dtos/pure';
import type { PartyRoomCommentDto, PartyRoomMemberDto } from '../api';

type PartyComment = PartyRoomCommentDto;

export function PartyChat({
  roomId,
  members,
  currentUserId,
}: {
  roomId: string;
  members: PartyRoomMemberDto[];
  currentUserId?: string;
}) {
  const comments = useRoomComments(roomId);
  const sendComment = useSendRoomComment(roomId);
  const [content, setContent] = useState('');
  const [liveComments, setLiveComments] = useState<PartyComment[]>([]);
  const appendLiveComment = useCallback((comment: PartyComment): void => {
    setLiveComments((current) =>
      current.some((item) => item.id === comment.id)
        ? current
        : [...current, comment],
    );
  }, []);
  const nicknameById = useMemo(
    () => new Map(members.map((member) => [member.userId, member.nickname])),
    [members],
  );

  const onCommentCreated = useCallback(
    (data: PartyCommentCreatedEventData) => {
      if (data.roomId !== roomId) return;
      appendLiveComment({
        id: data.commentId,
        roomId: data.roomId,
        senderUserId: data.senderUserId,
        content: data.content,
        sentAt: data.sentAt,
      });
    },
    [appendLiveComment, roomId],
  );
  useRealtimeEvent<PartyCommentCreatedEventData>(
    RealtimeEvents.PartyCommentCreated,
    onCommentCreated,
  );

  const visibleComments = useMemo(() => {
    const byId = new Map<string, PartyComment>();
    for (const comment of comments.data?.pages.flatMap(
      (page) => page?.items ?? [],
    ) ?? []) {
      byId.set(comment.id, comment);
    }
    for (const comment of liveComments) byId.set(comment.id, comment);
    return [...byId.values()].sort(
      (left, right) =>
        new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
    );
  }, [comments.data?.pages, liveComments]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length === 0 || sendComment.isPending) return;
    sendComment.mutate(
      { content: trimmed, idempotencyKey: crypto.randomUUID() },
      {
        // Event realtime sẽ dedupe theo comment id; response giúp sender hiển thị ngay cả khi
        // publish WebSocket best-effort thất bại. Reconnect/global fallback sẽ pull lại history.
        onSuccess: (comment) => {
          if (comment !== undefined) appendLiveComment(comment);
          setContent('');
        },
      },
    );
  };

  const errorMessage = isApiError(sendComment.error)
    ? sendComment.error.message
    : sendComment.error !== null
      ? 'Không thể gửi bình luận, thử lại.'
      : undefined;

  return (
    <section className="mx-5 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">Bình luận</p>
        {comments.hasNextPage && (
          <button
            type="button"
            className="text-xs font-semibold text-irisl disabled:opacity-50"
            disabled={comments.isFetchingNextPage}
            onClick={() => void comments.fetchNextPage()}
          >
            {comments.isFetchingNextPage ? 'Đang tải…' : 'Xem cũ hơn'}
          </button>
        )}
      </div>

      <div
        className="max-h-64 space-y-2 overflow-y-auto pr-1"
        aria-live="polite"
        aria-label="Bình luận trong phòng"
      >
        {comments.isPending && (
          <p className="text-xs text-slate-500">Đang tải bình luận…</p>
        )}
        {!comments.isPending && visibleComments.length === 0 && (
          <p className="text-xs text-slate-500">
            Hãy là người đầu tiên bình luận.
          </p>
        )}
        {visibleComments.map((comment) => {
          const name =
            comment.senderUserId === currentUserId
              ? 'Bạn'
              : (nicknameById.get(comment.senderUserId) ?? 'Người nghe');
          return (
            <p key={comment.id} className="break-words text-sm">
              <span className="mr-1 font-bold">{name}</span>
              <span>{comment.content}</span>
            </p>
          );
        })}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={submit}>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Viết bình luận…"
          aria-label="Nội dung bình luận"
          className="min-w-0 flex-1 rounded-full border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-irisl dark:border-white/10"
        />
        <button
          type="submit"
          disabled={sendComment.isPending || content.trim().length === 0}
          className="rounded-full bg-irisl px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
      {errorMessage !== undefined && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
