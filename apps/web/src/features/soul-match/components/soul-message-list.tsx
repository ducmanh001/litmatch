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
    return <p className="text-sm text-muted-foreground">Đang tải tin nhắn…</p>;
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
      <p className="text-sm text-muted-foreground">
        Chưa có tin nhắn nào — bắt đầu trò chuyện đi!
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((message) => (
        <li
          key={message.id}
          className={
            message.senderRole === 'me'
              ? 'ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
              : 'mr-auto max-w-[80%] rounded-lg bg-card px-3 py-2 text-sm'
          }
        >
          {message.content}
        </li>
      ))}
    </ul>
  );
}
