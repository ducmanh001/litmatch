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

/** Bảng emoji hay dùng — chèn thẳng vào nội dung, không cần thư viện ngoài. */
const EMOJI_CHOICES = [
  '😊',
  '😂',
  '🥰',
  '😍',
  '🤗',
  '😎',
  '🥺',
  '😢',
  '👍',
  '👏',
  '🎉',
  '❤️',
  '🔥',
  '✨',
  '🌈',
  '☕',
] as const;

const AUDIENCE_OPTIONS = [
  { value: 'public', label: '🌏 Công khai' },
  { value: 'friends', label: '👥 Bạn bè' },
  { value: 'only_me', label: '🔒 Chỉ mình tôi' },
] as const;

export function PostComposer() {
  const form = useForm<CreatePostForm>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { content: '', imageUrl: '', audience: 'public' },
  });
  const createPost = useCreatePost();
  const { key: idempotencyKey, resetKey } = useIdempotencyKey();
  const { data: currentUser } = useCurrentUser();
  const [showImageInput, setShowImageInput] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
          audience: values.audience,
        },
        idempotencyKey,
      },
      {
        onSuccess: (posted) => {
          if (posted === undefined) return;
          form.reset({ content: '', imageUrl: '', audience: values.audience });
          setShowImageInput(false);
          setShowEmojiPicker(false);
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
        <PostAuthorAvatar seed={currentUser?.id ?? 'me'} size={9} />
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
            aria-label="Chèn emoji"
            aria-expanded={showEmojiPicker}
            onClick={() => setShowEmojiPicker((shown) => !shown)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-black/5 dark:hover:bg-white/5 ${
              showEmojiPicker ? 'bg-iris/10' : ''
            }`}
          >
            😊
          </button>
          <select
            aria-label="Ai có thể xem bài viết"
            className="ml-1 h-8 rounded-full border border-black/5 bg-transparent px-2 text-xs font-semibold text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-iris dark:border-white/10 dark:text-white/70 dark:[&>option]:bg-surf"
            {...form.register('audience')}
          >
            {AUDIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-irisl px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={createPost.isPending}
        >
          {createPost.isPending ? 'Đang đăng…' : 'Đăng'}
        </button>
      </div>
      {showEmojiPicker && (
        <div
          role="group"
          aria-label="Chọn emoji"
          className="flex flex-wrap gap-1 rounded-xl border border-black/5 bg-slate-50/80 p-2 dark:border-white/10 dark:bg-white/5"
        >
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Chèn ${emoji}`}
              onClick={() =>
                form.setValue(
                  'content',
                  `${form.getValues('content') ?? ''}${emoji}`,
                  { shouldDirty: true },
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-black/5 dark:hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
