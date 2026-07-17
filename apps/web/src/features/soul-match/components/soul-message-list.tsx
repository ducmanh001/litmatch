'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect } from 'react';

import { useSoulMessages } from '../api';

export function SoulMessageList({ sessionId }: { sessionId: string }) {
  const messages = useSoulMessages(sessionId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;

  // API chỉ hỗ trợ cursor tiến (afterSeq) — không có "load older", nên tự động kéo tới
  // tin nhắn mới nhất thay vì bắt user bấm "xem thêm" mỗi khi có tin nhắn mới tới.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (messages.isPending) {
    return (
      <p className="px-5 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải tin nhắn…
      </p>
    );
  }

  if (messages.isError) {
    const message = isApiError(messages.error)
      ? messages.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="px-5 py-4 text-sm text-destructive">
        {message}
      </p>
    );
  }

  const items = messages.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  if (items.length === 0) {
    return (
      <p className="px-5 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Chưa có tin nhắn nào — bắt đầu trò chuyện đi!
      </p>
    );
  }

  return (
    <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
      {items.map((message) => (
        <li
          key={message.id}
          className={message.senderRole === 'me' ? 'flex justify-end' : 'flex'}
        >
          <div
            className={
              message.senderRole === 'me'
                ? 'max-w-[75%] min-w-0 whitespace-pre-wrap rounded-2xl rounded-tr-md bg-gradient-to-br from-irisl to-irisl px-4 py-2.5 text-sm text-white [overflow-wrap:anywhere]'
                : 'max-w-[75%] min-w-0 whitespace-pre-wrap rounded-2xl rounded-tl-md bg-slate-100 px-4 py-2.5 text-sm [overflow-wrap:anywhere] dark:bg-surf2'
            }
          >
            {message.content}
          </div>
        </li>
      ))}
    </ul>
  );
}
