'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { FlagIcon } from '../../../shared/ui/icons';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useReportVideo, useVideoFeed } from '../api';
import { VideoCommentsSheet } from './video-comments-sheet';
import { VideoGiftSheet } from './video-gift-sheet';
import { VideoLikeButton } from './video-like-button';
import { VideoSlide } from './video-slide';

import type {
  ReactionStatusDto,
  VideoDto,
  VideoFeedScope,
  VideoFeedSort,
} from '../api';
import type { SVGProps } from 'react';

/** "Dành cho bạn" xếp theo `ranked` (engagement + time-decay); tab chỉ đổi `feed` scope. */
const ACTIVE_SORT: VideoFeedSort = 'ranked';

function VideoFeedTabs({
  scope,
  onScopeChange,
}: {
  scope: VideoFeedScope;
  onScopeChange: (scope: VideoFeedScope) => void;
}) {
  const tab = (value: VideoFeedScope, label: string) => {
    const active = scope === value;
    return (
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onScopeChange(value)}
        className={active ? 'relative text-white' : 'text-white/50'}
      >
        {label}
        {active && (
          <span className="absolute -bottom-1.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-white" />
        )}
      </button>
    );
  };

  return (
    <div className="absolute inset-x-0 top-3 z-30 flex items-center justify-between px-4">
      <div className="w-[76px]" aria-hidden />
      <div className="flex items-center gap-6 text-sm font-bold">
        {tab('following', 'Đang theo dõi')}
        {tab('for_you', 'Dành cho bạn')}
      </div>
      <div className="w-[76px]" aria-hidden />
    </div>
  );
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M6 3h12l3 5-9 13L3 8z" />
      <path d="M3 8h18M9 3l3 5 3-5M12 8l-2 13M12 8l2 13" />
    </svg>
  );
}

function VideoReportButton({ videoId }: { videoId: string }) {
  const report = useReportVideo(videoId);

  const onReport = async () => {
    const confirmed = await confirmAction({
      title: 'Báo cáo video?',
      message:
        'Video sẽ được gửi tới đội ngũ kiểm duyệt với lý do nội dung không phù hợp.',
      actionLabel: 'Gửi báo cáo',
      tone: 'danger',
    });
    if (!confirmed) return;
    report.mutate(
      { reason: 'inappropriate_content' },
      {
        onSuccess: () => showToast('Đã gửi báo cáo. Cảm ơn bạn.'),
        onError: () => showToast('Không thể gửi báo cáo, thử lại.', 'warn'),
      },
    );
  };

  return (
    <button
      type="button"
      disabled={report.isPending}
      onClick={() => void onReport()}
      aria-label="Báo cáo video có nội dung không phù hợp"
      className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90 disabled:opacity-50"
    >
      <FlagIcon />
      <span className="text-xs font-bold">Báo cáo</span>
    </button>
  );
}

/**
 * Cột hành động (avatar/thích/bình luận/tặng/report) — DÙNG CHUNG 1 instance cho video đang
 * active, chỉ đổi vị trí bằng className theo breakpoint (mobile: overlay tuyệt đối trên video;
 * desktop: cột riêng bên cạnh, đúng layouts/web/video.html). Mockup có 2 bộ DOM riêng (đồng bộ
 * tay qua JS `extLikeBtn`/...) — ở đây dùng 1 instance duy nhất (className truyền từ ngoài vào)
 * để không bao giờ lệch state thích/bình luận giữa 2 vị trí hiển thị.
 */
function VideoActionRail({
  video,
  onOpenComments,
  onOpenGifts,
  reaction,
  onReactionChange,
  soundMuted,
  onToggleSound,
  className,
}: {
  video: VideoDto;
  onOpenComments: () => void;
  onOpenGifts: () => void;
  reaction: ReactionStatusDto;
  onReactionChange: (reaction: ReactionStatusDto) => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  className: string;
}) {
  return (
    <div className={className}>
      <Link
        href={`/users/${video.authorUserId}`}
        aria-label="Xem hồ sơ tác giả video"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-white bg-surf2"
      >
        <PlaceholderAvatar seed={video.authorUserId} alt="" size={40} />
        <span className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-irisl text-xs font-bold text-white">
          +
        </span>
      </Link>

      <VideoLikeButton
        video={video}
        reaction={reaction}
        onReactionChange={onReactionChange}
      />

      <button
        type="button"
        onClick={onOpenComments}
        className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
      >
        <CommentIcon />
        <span className="text-xs font-bold">{video.commentCount}</span>
      </button>

      <button
        type="button"
        onClick={onOpenGifts}
        aria-label="Tặng quà cho tác giả"
        className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
      >
        <GiftIcon />
        <span className="text-xs font-bold">Tặng</span>
      </button>

      {/* <VideoReportButton videoId={video.id} /> */}

      <button
        type="button"
        disabled={video.playbackUrl === null}
        onClick={onToggleSound}
        aria-label={
          soundMuted
            ? 'Bật âm thanh gốc của video'
            : 'Tắt âm thanh gốc của video'
        }
        title="Âm thanh gốc"
        className="disc-spin mt-1 flex h-9 w-9 items-center justify-center rounded-full border-black/20 bg-gradient-to-br from-irisl to-aqual transition-transform active:scale-90 disabled:animate-none disabled:opacity-50"
      >
        <span className="h-3 w-3 rounded-full bg-black/60" />
      </button>
    </div>
  );
}

export function VideoReelFeed() {
  const [scope, setScope] = useState<VideoFeedScope>('for_you');
  const feed = useVideoFeed(ACTIVE_SORT, scope);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [reactionByVideoId, setReactionByVideoId] = useState<
    Record<string, ReactionStatusDto>
  >({});
  const [mutedByVideoId, setMutedByVideoId] = useState<Record<string, boolean>>(
    {},
  );

  const videos = feed.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
  // Mặc định video đầu tiên khi chưa có slide nào intersect (mount lần đầu, hoặc IntersectionObserver
  // không chạy như trong jsdom test env) — đúng hành vi "video đầu tự phát" của mọi app reel.
  const activeVideo =
    videos.find((v) => v.id === activeVideoId) ?? videos[0] ?? null;

  useEffect(() => {
    const el = sentinelRef.current;
    if (el === null) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting === true) {
        void fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage]);

  return (
    <div className="h-[100dvh] min-h-0 w-full bg-black md:flex md:items-stretch md:justify-center md:p-4">
      {/* Wrapper KHÔNG overflow-hidden — cho phép cột hành động "thoát" ra khỏi khung video bo
          góc trên desktop mà vẫn dùng chung 1 instance với vị trí overlay trên mobile.
          Desktop: wrapper cao bằng toàn bộ viewport trừ gutter 1rem mỗi cạnh; khung video lấy
          hết chiều cao khả dụng và aspect-[9/16] tự suy ra width, nên vừa full-height vừa không
          kéo giãn hình trên màn cao. */}
      <div className="relative h-full min-h-0 md:flex md:items-stretch">
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-black md:aspect-[9/16] md:w-auto md:rounded-[2rem] md:border md:border-white/10 md:shadow-2xl md:shadow-black/40">
          <VideoFeedTabs scope={scope} onScopeChange={setScope} />

          <div className="no-scrollbar h-full min-h-0 w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain">
            {feed.isPending && (
              <p className="flex h-full items-center justify-center text-sm text-white/70">
                Đang tải video…
              </p>
            )}

            {feed.isError && (
              <p
                role="alert"
                className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive"
              >
                {isApiError(feed.error)
                  ? feed.error.message
                  : 'Có lỗi xảy ra, thử lại.'}
              </p>
            )}

            {!feed.isPending && !feed.isError && videos.length === 0 && (
              <p className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
                {scope === 'following'
                  ? 'Chưa có video nào từ bạn bè của bạn.'
                  : 'Chưa có video nào.'}
              </p>
            )}

            {videos.map((video) => (
              <VideoSlide
                key={video.id}
                video={video}
                onActiveChange={(v) => setActiveVideoId(v.id)}
                muted={mutedByVideoId[video.id] ?? true}
                onMutedChange={(muted) =>
                  setMutedByVideoId((current) => ({
                    ...current,
                    [video.id]: muted,
                  }))
                }
              />
            ))}

            {hasNextPage && (
              <div
                ref={sentinelRef}
                className="h-px w-full shrink-0 snap-start"
              />
            )}
            {isFetchingNextPage && (
              <p className="py-3 text-center text-xs text-white/60">
                Đang tải thêm…
              </p>
            )}
          </div>
        </div>

        {activeVideo !== null && (
          <VideoActionRail
            key={activeVideo.id}
            video={activeVideo}
            onOpenComments={() => setCommentsOpen(true)}
            onOpenGifts={() => setGiftsOpen(true)}
            reaction={
              reactionByVideoId[activeVideo.id] ?? {
                liked: false,
                likeCount: activeVideo.likeCount,
              }
            }
            onReactionChange={(reaction) =>
              setReactionByVideoId((current) => ({
                ...current,
                [activeVideo.id]: reaction,
              }))
            }
            soundMuted={mutedByVideoId[activeVideo.id] ?? true}
            onToggleSound={() =>
              setMutedByVideoId((current) => ({
                ...current,
                [activeVideo.id]: !(current[activeVideo.id] ?? true),
              }))
            }
            className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5 md:static md:flex-col md:justify-end md:gap-5 md:self-stretch md:pb-10 md:pl-4"
          />
        )}
      </div>

      <VideoCommentsSheet
        videoId={activeVideo?.id ?? null}
        commentCount={activeVideo?.commentCount ?? 0}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
      <VideoGiftSheet
        videoId={activeVideo?.id ?? null}
        open={giftsOpen}
        onClose={() => setGiftsOpen(false)}
      />
    </div>
  );
}
