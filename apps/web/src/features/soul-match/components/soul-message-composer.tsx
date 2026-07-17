'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { useSendSoulMessage } from '../api';
import { sendMessageSchema } from '../send-message-schema';

import type { SendMessageForm } from '../send-message-schema';

// Icon gửi tin nhắn cục bộ — chỉ dùng ở composer này, không thêm vào bộ icon dùng chung.
function SendIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  );
}

export function SoulMessageComposer({ sessionId }: { sessionId: string }) {
  const form = useForm<SendMessageForm>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { content: '' },
  });
  const sendMessage = useSendSoulMessage(sessionId);
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
    <form
      className="space-y-1.5 border-t border-black/5 px-5 py-4 dark:border-white/5"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Nội dung tin nhắn"
          placeholder="Nhắn tin ẩn danh…"
          className="flex-1 rounded-full bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-iris dark:bg-surf2"
          {...form.register('content')}
        />
        <button
          type="submit"
          aria-label="Gửi tin nhắn"
          disabled={sendMessage.isPending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl disabled:opacity-50"
        >
          <SendIcon />
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
