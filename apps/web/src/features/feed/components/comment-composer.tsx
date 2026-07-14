'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useCreateComment } from '../api';
import { createCommentSchema } from '../create-comment-schema';

import type { CreateCommentForm } from '../create-comment-schema';

export function CommentComposer({ postId }: { postId: string }) {
  const form = useForm<CreateCommentForm>({
    resolver: zodResolver(createCommentSchema),
    defaultValues: { content: '' },
  });
  const createComment = useCreateComment(postId);

  const message =
    form.formState.errors.content?.message ??
    (isApiError(createComment.error)
      ? createComment.error.message
      : createComment.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit(({ content }) => {
    createComment.mutate(content, {
      onSuccess: (commented) => {
        if (commented === undefined) return;
        form.reset();
      },
    });
  });

  return (
    <form className="space-y-1.5" onSubmit={onSubmit} noValidate>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Nội dung bình luận"
          placeholder="Viết bình luận…"
          className="h-10 flex-1 rounded-full border border-black/5 bg-white px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-iris dark:border-white/10 dark:bg-surf"
          {...form.register('content')}
        />
        <button
          type="submit"
          className="h-10 rounded-full bg-irisl px-5 text-sm font-bold text-white disabled:opacity-50"
          disabled={createComment.isPending}
        >
          {createComment.isPending ? 'Đang gửi…' : 'Gửi'}
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
