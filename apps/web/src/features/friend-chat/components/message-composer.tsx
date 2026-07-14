'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { DiamondIcon } from '../../../shared/ui/icons';
import { useSendFriendMessage } from '../api';
import { sendMessageSchema } from '../send-message-schema';

import type { SendMessageForm } from '../send-message-schema';

export function MessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const form = useForm<SendMessageForm>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { content: '' },
  });
  const sendMessage = useSendFriendMessage(conversationId);
  const { key, resetKey } = useIdempotencyKey();

  const message =
    form.formState.errors.content?.message ??
    (isApiError(sendMessage.error)
      ? sendMessage.error.message
      : sendMessage.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit(({ content }) => {
    sendMessage.mutate(
      { content, idempotencyKey: key },
      {
        onSuccess: (sent) => {
          if (sent === undefined) return;
          form.reset();
          resetKey();
        },
      },
    );
  });

  return (
    <form className="space-y-1.5" onSubmit={onSubmit} noValidate>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-label="Đính kèm ảnh (sắp có)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 opacity-50 dark:bg-surf2 dark:text-slate-300"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7l1.5-3h5L16 7" />
            <circle cx="12" cy="13.5" r="3.5" />
          </svg>
        </button>
        <Link
          href="/wallet"
          aria-label="Nạp kim cương"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-diamond/10 text-sky-600 dark:text-diamond"
        >
          <DiamondIcon width={16} height={16} />
        </Link>
        <input
          type="text"
          aria-label="Nội dung tin nhắn"
          placeholder="Nhắn gì đó…"
          className="h-10 min-w-0 flex-1 rounded-full bg-slate-100 px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:bg-surf2"
          {...form.register('content')}
        />
        <button
          type="submit"
          aria-label={sendMessage.isPending ? 'Đang gửi…' : 'Gửi'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-irisl text-white disabled:opacity-50"
          disabled={sendMessage.isPending}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
