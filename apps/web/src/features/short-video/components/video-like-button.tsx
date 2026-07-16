'use client';

import { useState } from 'react';

import { showToast } from '../../../shared/lib/toast-store';
import { useLikeVideo, useUnlikeVideo } from '../api';

import type { ReactionStatusDto, VideoDto } from '../api';
import type { SVGProps } from 'react';

function HeartIcon({
  filled,
  ...props
}: SVGProps<SVGSVGElement> & { filled: boolean }) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M12 21s-7.5-4.6-10-9.2C.5 8.4 2 5 5.5 5c2 0 3.4 1.1 4.5 2.6C11.1 6.1 12.5 5 14.5 5 18 5 19.5 8.4 22 11.8 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/**
 * Không có endpoint GET trạng thái reaction cho short-video (khác feed's
 * `GET /posts/{postId}/reactions`) — `liked` chỉ biết được sau khi tự bấm trong phiên này, mặc
 * định coi là chưa thích khi mount.
 */
export function VideoLikeButton({
  video,
  reaction: controlledReaction,
  onReactionChange,
}: {
  video: VideoDto;
  reaction?: ReactionStatusDto;
  onReactionChange?: (reaction: ReactionStatusDto) => void;
}) {
  const [localReaction, setLocalReaction] = useState<ReactionStatusDto>({
    liked: false,
    likeCount: video.likeCount,
  });
  const reaction = controlledReaction ?? localReaction;
  const setReaction = (next: ReactionStatusDto) => {
    setLocalReaction(next);
    onReactionChange?.(next);
  };
  const like = useLikeVideo(video.id);
  const unlike = useUnlikeVideo(video.id);
  const pending = like.isPending || unlike.isPending;

  const onClick = () => {
    const previous = reaction;
    const optimistic = {
      liked: !previous.liked,
      likeCount: previous.likeCount + (previous.liked ? -1 : 1),
    };
    setReaction(optimistic);

    const mutation = previous.liked ? unlike : like;
    mutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data === undefined) return;
        setReaction(data);
      },
      onError: () => {
        setReaction(previous);
        showToast('Không thể cập nhật lượt thích, thử lại.', 'warn');
      },
    });
  };

  return (
    <button
      type="button"
      aria-pressed={reaction.liked}
      disabled={pending}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-50 ${
        reaction.liked ? 'text-irisl' : 'text-white'
      }`}
    >
      <HeartIcon filled={reaction.liked} />
      <span className="text-xs font-bold">{reaction.likeCount}</span>
    </button>
  );
}
