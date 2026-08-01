'use client';

import { isApiError } from '@litmatch/api-client';
import { useEffect, useRef } from 'react';

import { useFeed } from '../api';
import { FeedBanners } from './feed-banners';
import { PostCard } from './post-card';
import { PostComposer } from './post-composer';

export function PostList() {
  const feed = useFeed();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      target === null ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = feed.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <div className="space-y-4">
      <div id="tao-bai-viet" className="scroll-mt-4">
        <PostComposer />
      </div>
      <FeedBanners />

      {feed.isPending && (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Đang tải bảng tin…
        </p>
      )}

      {feed.isError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {isApiError(feed.error)
            ? feed.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {!feed.isPending && !feed.isError && items.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Chưa có bài viết nào — hãy là người đầu tiên đăng bài.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div
          ref={loadMoreRef}
          className="flex min-h-10 items-center justify-center"
          aria-live="polite"
        >
          {isFetchingNextPage && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Đang tải…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
