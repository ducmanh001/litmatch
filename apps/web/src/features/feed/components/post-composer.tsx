'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useCreatePost } from '../api';
import { createPostSchema } from '../create-post-schema';
import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';

import type { CreatePostForm } from '../create-post-schema';

export function PostComposer() {
  const form = useForm<CreatePostForm>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { content: '', imageUrl: '' },
  });
  const createPost = useCreatePost();
  const { key: idempotencyKey, resetKey } = useIdempotencyKey();

  const message =
    form.formState.errors.content?.message ??
    form.formState.errors.imageUrl?.message ??
    (isApiError(createPost.error)
      ? createPost.error.message
      : createPost.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit((values) => {
    createPost.mutate(
      {
        body: {
          content: values.content === '' ? undefined : values.content,
          imageUrl: values.imageUrl === '' ? undefined : values.imageUrl,
          // Composer chưa có UI chọn audience — giữ hành vi hiện tại (luôn public).
          audience: 'public',
        },
        idempotencyKey,
      },
      {
        onSuccess: (posted) => {
          if (posted === undefined) return;
          form.reset({ content: '', imageUrl: '' });
          resetKey();
        },
      },
    );
  });

  return (
    <form
      className="space-y-2 rounded-md border border-border p-3"
      onSubmit={onSubmit}
      noValidate
    >
      <textarea
        aria-label="Nội dung bài viết"
        placeholder="Bạn đang nghĩ gì?"
        rows={3}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        {...form.register('content')}
      />
      <input
        type="text"
        aria-label="Đường dẫn ảnh (không bắt buộc)"
        placeholder="Đường dẫn ảnh (không bắt buộc)"
        className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        {...form.register('imageUrl')}
      />
      <div className="flex items-center justify-between">
        {message !== undefined ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={createPost.isPending}
        >
          {createPost.isPending ? 'Đang đăng…' : 'Đăng bài'}
        </button>
      </div>
    </form>
  );
}
