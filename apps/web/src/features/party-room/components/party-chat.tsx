'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../../shared/lib/cn';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { FriendAvatar } from '../../friend-chat/components/friend-avatar';
import { useRoomComments, useSendRoomComment } from '../api';

import type { FormEvent } from 'react';
import type { PartyCommentCreatedEventData } from '@litmatch/common-dtos/pure';
import type { PartyRoomCommentDto, PartyRoomMemberDto } from '../api';

type PartyComment = PartyRoomCommentDto;

const ROLE_LABEL: Partial<Record<PartyRoomMemberDto['role'], string>> = {
  host: 'Host',
  speaker: 'Speaker',
};

function formatCommentTime(sentAt: string): string {
  return new Date(sentAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  const commentsListRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);

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
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
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

  // Chỉ bám đáy khi user đang đọc tin mới nhất; đang kéo lên đọc tin cũ thì không bị giật.
  useEffect(() => {
    const list = commentsListRef.current;
    if (list === null || !stickToLatestRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [visibleComments.length]);

  const handleCommentsScroll = (): void => {
    const list = commentsListRef.current;
    if (list === null) return;
    const distanceFromLatest =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToLatestRef.current = distanceFromLatest < 64;
  };

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
  const commentsErrorMessage = comments.isError
    ? isApiError(comments.error)
      ? comments.error.message
      : 'Không thể tải bình luận, thử lại.'
    : undefined;

  return (
    <section className="mx-5 overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-sm shadow-black/[0.03] dark:border-white/10 dark:bg-surf dark:shadow-black/20">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <div className="min-w-0">
          <p className="text-sm font-bold">Bình luận</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Nói chuyện cùng mọi người trong phòng
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-iris/10 px-2.5 py-1 text-[11px] font-bold text-irisl">
          {members.length} người
        </span>
      </div>

      {comments.hasNextPage && (
        <div className="border-b border-black/5 px-4 py-2 dark:border-white/10">
          <button
            type="button"
            className="text-[11px] font-bold text-irisl disabled:opacity-50"
            disabled={comments.isFetchingNextPage}
            onClick={() => void comments.fetchNextPage()}
          >
            {comments.isFetchingNextPage
              ? 'Đang tải tin cũ…'
              : 'Xem tin cũ hơn'}
          </button>
        </div>
      )}

      <div
        ref={commentsListRef}
        onScroll={handleCommentsScroll}
        className="max-h-72 min-h-28 overflow-y-auto overscroll-contain px-4 py-3 sm:max-h-80"
        aria-live="polite"
        aria-label="Bình luận trong phòng"
      >
        {comments.isPending && (
          <div className="space-y-3" aria-label="Đang tải bình luận">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-slate-100 dark:bg-surf2" />
                <span className="h-9 w-3/4 animate-pulse rounded-2xl bg-slate-100 dark:bg-surf2" />
              </div>
            ))}
          </div>
        )}

        {commentsErrorMessage !== undefined && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {commentsErrorMessage}
          </p>
        )}

        {!comments.isPending &&
          commentsErrorMessage === undefined &&
          visibleComments.length === 0 && (
            <div className="flex min-h-20 flex-col items-center justify-center text-center">
              <span className="mb-1 text-xl" aria-hidden>
                💬
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hãy mở lời để mọi người cùng tham gia nhé.
              </p>
            </div>
          )}

        {!comments.isPending && visibleComments.length > 0 && (
          <ul className="space-y-3">
            {visibleComments.map((comment) => {
              const member = memberById.get(comment.senderUserId);
              const isMine = comment.senderUserId === currentUserId;
              const name = isMine
                ? 'Bạn'
                : (nicknameById.get(comment.senderUserId) ?? 'Người nghe');
              const roleLabel = member?.role
                ? ROLE_LABEL[member.role]
                : undefined;

              return (
                <li
                  key={comment.id}
                  className="flex min-w-0 items-start gap-2.5"
                >
                  <FriendAvatar
                    userId={comment.senderUserId}
                    nickname={member?.nickname ?? name}
                    size={28}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'max-w-[12rem] truncate text-[11px] font-bold',
                          isMine
                            ? 'text-irisl'
                            : 'text-slate-700 dark:text-white/85',
                        )}
                      >
                        {name}
                      </span>
                      {roleLabel !== undefined && (
                        <span className="shrink-0 rounded-full bg-iris/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-irisl">
                          {roleLabel}
                        </span>
                      )}
                      <time
                        dateTime={comment.sentAt}
                        className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-slate-500"
                      >
                        {formatCommentTime(comment.sentAt)}
                      </time>
                    </div>
                    <p
                      className={cn(
                        'mt-0.5 inline-block max-w-full whitespace-pre-wrap rounded-2xl px-2.5 py-1.5 text-[13px] leading-5 [overflow-wrap:anywhere]',
                        isMine
                          ? 'bg-iris/10 text-slate-800 dark:bg-iris/15 dark:text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-surf2 dark:text-white/90',
                      )}
                    >
                      {comment.content}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-black/5 p-3 dark:border-white/10">
        <form className="flex items-center gap-2" onSubmit={submit}>
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Nói gì đó với mọi người…"
            aria-label="Nội dung bình luận"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-full bg-slate-100 px-4 text-sm outline-none transition focus:ring-2 focus:ring-iris dark:bg-surf2 dark:text-white dark:placeholder:text-white/55"
          />
          <button
            type="submit"
            aria-label={sendComment.isPending ? 'Đang gửi…' : 'Gửi bình luận'}
            disabled={sendComment.isPending || content.trim().length === 0}
            className="flex h-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual px-4 text-xs font-bold text-white shadow-sm shadow-iris/20 transition active:scale-95 disabled:opacity-50 disabled:shadow-none"
          >
            {sendComment.isPending ? '…' : 'Gửi'}
          </button>
        </form>
        {errorMessage !== undefined && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}
