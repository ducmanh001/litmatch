'use client';

import { useLike, useReactionStatus, useUnlike } from '../api';

import type { SVGProps } from 'react';

function HeartIcon({
  filled,
  ...props
}: SVGProps<SVGSVGElement> & { filled: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      {...props}
    >
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

export function LikeButton({
  postId,
  fallbackLikeCount,
}: {
  postId: string;
  fallbackLikeCount: number;
}) {
  const reaction = useReactionStatus(postId);
  const like = useLike(postId);
  const unlike = useUnlike(postId);

  const liked = reaction.data?.liked ?? false;
  const likeCount = reaction.data?.likeCount ?? fallbackLikeCount;
  const pending = like.isPending || unlike.isPending;

  return (
    <button
      type="button"
      aria-label={`${liked ? 'Bỏ thích' : 'Thích'} bài viết, ${likeCount} lượt thích`}
      aria-pressed={liked}
      disabled={pending}
      onClick={() => (liked ? unlike.mutate() : like.mutate())}
      className={`flex min-w-0 w-full items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5 ${
        liked ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'
      }`}
    >
      <HeartIcon filled={liked} />
      <span>{liked ? 'Đã thích' : 'Thích'}</span>
    </button>
  );
}
