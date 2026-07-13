'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
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
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Nội dung tin nhắn"
          placeholder="Nhắn gì đó…"
          className="h-10 flex-1 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('content')}
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={sendMessage.isPending}
        >
          {sendMessage.isPending ? 'Đang gửi…' : 'Gửi'}
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
