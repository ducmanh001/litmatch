'use client';

import { useLike, useReactionStatus, useUnlike } from '../api';

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
      aria-pressed={liked}
      disabled={pending}
      onClick={() => (liked ? unlike.mutate() : like.mutate())}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm disabled:opacity-50 ${
        liked
          ? 'border-primary text-primary'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {liked ? '♥' : '♡'} {likeCount}
    </button>
  );
}
