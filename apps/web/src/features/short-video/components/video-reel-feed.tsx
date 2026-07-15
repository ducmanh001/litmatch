'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect, useRef } from 'react';

import { useVideoFeed } from '../api';
import { VideoSlide } from './video-slide';

import type { VideoFeedSort } from '../api';

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

export function VideoReelFeed() {
  const feed = useVideoFeed(ACTIVE_SORT);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const videos = feed.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

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
    <div className="relative mx-auto w-full max-w-[430px]">
      <div className="relative h-[calc(100dvh-13rem)] min-h-[420px] w-full overflow-hidden rounded-3xl bg-black">
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
            <VideoSlide key={video.id} video={video} />
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
    </div>
  );
}
