'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCreatePost } from '../api';
import { createPostSchema } from '../create-post-schema';
import { PostAuthorAvatar } from './post-author-avatar';
import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';

import type { CreatePostForm } from '../create-post-schema';
import type { SVGProps } from 'react';

function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x={3} y={7} width={18} height={13} rx={2} />
      <path d="M8 7l1.5-3h5L16 7" />
      <circle cx={12} cy={13.5} r={3.5} />
    </svg>
  );
}

export function PostComposer() {
  const form = useForm<CreatePostForm>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { content: '', imageUrl: '' },
  });
  const createPost = useCreatePost();
  const { key: idempotencyKey, resetKey } = useIdempotencyKey();
  const { data: currentUser } = useCurrentUser();
  const [showImageInput, setShowImageInput] = useState(false);

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
          setShowImageInput(false);
          resetKey();
          showToast('Đã đăng bài viết');
        },
      },
    );
  });

  return (
    <form
      className="space-y-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 dark:border-white/5 dark:bg-surf"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex items-center gap-3">
        <PostAuthorAvatar
          seed={currentUser?.id ?? 'me'}
          label={currentUser?.nickname}
          size={9}
          tone="bg-irisl"
        />
        <textarea
          aria-label="Nội dung bài viết"
          placeholder="Bạn đang nghĩ gì?"
          rows={1}
          className="w-full flex-1 resize-none border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus-visible:outline-none"
          {...form.register('content')}
        />
      </div>
      {showImageInput && (
        <input
          type="text"
          autoFocus
          aria-label="Đường dẫn ảnh (không bắt buộc)"
          placeholder="Đường dẫn ảnh (không bắt buộc)"
          className="h-10 w-full rounded-xl border border-black/5 bg-transparent px-3 text-sm placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-iris dark:border-white/10"
          {...form.register('imageUrl')}
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            aria-label="Đính kèm ảnh"
            aria-pressed={showImageInput}
            onClick={() => setShowImageInput((shown) => !shown)}
            className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 ${
              showImageInput ? 'text-irisl' : ''
            }`}
          >
            <CameraIcon />
          </button>
          <button
            type="button"
            disabled
            aria-label="Chèn emoji (sắp có)"
            className="flex h-8 w-8 items-center justify-center rounded-full text-base opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
          >
            😊
          </button>
        </div>
        <button
          type="submit"
          className="rounded-full bg-irisl px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={createPost.isPending}
        >
          {createPost.isPending ? 'Đang đăng…' : 'Đăng'}
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
