'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect, useRef, useState } from 'react';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { ProfileIcon } from '../../../shared/ui/icons';
import { useReportVideo, useVideoFeed } from '../api';
import { VideoCommentsSheet } from './video-comments-sheet';
import { VideoLikeButton } from './video-like-button';
import { VideoSlide } from './video-slide';

import type { VideoDto, VideoFeedSort } from '../api';
import type { SVGProps } from 'react';

/** Backend chỉ có `sort=recent|ranked` (video-ranking.service.ts) — KHÔNG có filter theo quan
 * hệ follow. "Dành cho bạn" map thật vào `ranked`; "Đang theo dõi" chưa có endpoint tương ứng
 * nên khoá lại thay vì giả một feed follow không tồn tại. */
const ACTIVE_SORT: VideoFeedSort = 'ranked';

function VideoFeedTabs() {
  return (
    <div className="absolute inset-x-0 top-3 z-30 flex items-center justify-center gap-6 text-sm font-bold">
      <button
        type="button"
        disabled
        aria-label="Đang theo dõi (sắp có)"
        className="text-white/40"
      >
        Đang theo dõi
      </button>
      <button type="button" aria-current="true" className="relative text-white">
        Dành cho bạn
        <span className="absolute -bottom-1.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-white" />
      </button>
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

function FlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M5 3v18" strokeLinecap="round" />
      <path d="M5 4h11l-2 4 2 4H5z" strokeLinejoin="round" />
    </svg>
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
  className,
}: {
  video: VideoDto;
  onOpenComments: () => void;
  className: string;
}) {
  const [reported, setReported] = useState(false);
  const reportVideo = useReportVideo(video.id);

  const onReport = async () => {
    if (reported || reportVideo.isPending) return;
    const confirmed = await confirmAction({
      title: 'Báo cáo video',
      message: 'Bạn có chắc muốn báo cáo video này vì nội dung không phù hợp?',
      actionLabel: 'Báo cáo',
      tone: 'danger',
    });
    if (!confirmed) return;
    reportVideo.mutate(
      { reason: 'inappropriate_content' },
      {
        onSuccess: () => {
          setReported(true);
          showToast('Đã gửi báo cáo, cảm ơn bạn');
        },
        onError: () => {
          showToast('Không thể gửi báo cáo, thử lại.', 'warn');
        },
      },
    );
  };

  return (
    <div className={className}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-surf2">
        <ProfileIcon width={20} height={20} className="text-white" />
      </span>

      <VideoLikeButton video={video} />

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
        disabled
        aria-label="Tặng quà (sắp có)"
        className="flex flex-col items-center gap-1 text-white/40"
      >
        <GiftIcon />
        <span className="text-xs font-bold">Tặng</span>
      </button>

      <button
        type="button"
        onClick={() => void onReport()}
        disabled={reported || reportVideo.isPending}
        aria-label={reported ? 'Đã báo cáo video này' : 'Báo cáo video'}
        className="flex flex-col items-center gap-1 text-white/70 transition-transform active:scale-90 disabled:opacity-50"
      >
        <FlagIcon />
        <span className="text-[10px] font-semibold">
          {reported ? 'Đã báo cáo' : 'Báo cáo'}
        </span>
      </button>
    </div>
  );
}

export function VideoReelFeed() {
  const feed = useVideoFeed(ACTIVE_SORT);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

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
    <div className="md:flex md:items-start md:justify-center">
      {/* Wrapper KHÔNG overflow-hidden — cho phép cột hành động "thoát" ra khỏi khung video bo
          góc trên desktop mà vẫn dùng chung 1 instance với vị trí overlay trên mobile. */}
      <div className="relative md:flex md:items-stretch">
        <div className="relative h-[100dvh] w-full max-w-[430px] overflow-hidden bg-black md:h-[calc(100vh-3rem)] md:max-w-md md:rounded-[2rem] md:border md:border-white/10 md:shadow-2xl md:shadow-black/40">
          <VideoFeedTabs />

          <div className="no-scrollbar h-full w-full snap-y snap-mandatory overflow-y-scroll">
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
                Chưa có video nào.
              </p>
            )}

            {videos.map((video) => (
              <VideoSlide
                key={video.id}
                video={video}
                onActiveChange={(v) => setActiveVideoId(v.id)}
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
            video={activeVideo}
            onOpenComments={() => setCommentsOpen(true)}
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
    </div>
  );
}
