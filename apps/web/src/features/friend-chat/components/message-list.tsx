'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useConversationMessages } from '../api';

import type { MessageDto } from '../api';

/**
 * Ảnh đính kèm: `kind='image'` (gửi từ composer) dùng payload.url; `story_reply` snapshot
 * `mediaUrl`. Kind lạ/payload thiếu URL → placeholder trung tính, không vỡ bubble.
 */
function MessageAttachmentView({
  attachment,
}: {
  attachment: MessageDto['attachment'];
}) {
  if (attachment == null) return null;
  const payload = attachment.payload as Record<string, unknown>;
  const url = [payload['url'], payload['mediaUrl']].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (url !== undefined) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL ảnh ngoài domain, không qua next/image optimizer
      <img
        src={url}
        alt="Ảnh đính kèm"
        loading="lazy"
        className="mb-2 max-h-64 w-full rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="mb-2 flex h-32 w-full items-center justify-center rounded-xl bg-gradient-to-br from-white/25 to-white/5">
      <svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="currentColor"
        opacity={0.8}
        aria-hidden
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

export function MessageList({ conversationId }: { conversationId: string }) {
  const { data: me } = useCurrentUser();
  const messages = useConversationMessages(conversationId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;

  // API chỉ hỗ trợ cursor tiến (afterSeq) — không có "load older", tự kéo tới tin nhắn
  // mới nhất thay vì bắt user bấm "xem thêm" mỗi khi có tin nhắn mới tới.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (messages.isPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-white/70">
        Đang tải tin nhắn…
      </p>
    );
  }

  if (messages.isError) {
    const message = isApiError(messages.error)
      ? messages.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  const items = messages.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-white/70">
        Chưa có tin nhắn nào — bắt đầu trò chuyện đi!
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((message) => {
        const isMine = message.senderUserId === me?.id;
        return (
          <li
            key={message.id}
            className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={
                isMine
                  ? 'max-w-[75%] min-w-0 whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground [overflow-wrap:anywhere]'
                  : 'max-w-[75%] min-w-0 whitespace-pre-wrap rounded-2xl rounded-bl-md border border-black/5 bg-white px-4 py-2.5 text-sm [overflow-wrap:anywhere] dark:border-white/10 dark:bg-surf dark:text-white'
              }
            >
              <MessageAttachmentView attachment={message.attachment} />
              {message.content}
            </div>
            <span className="mt-1 px-1 text-[11px] text-slate-400 dark:text-white/65">
              {new Date(message.sentAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
