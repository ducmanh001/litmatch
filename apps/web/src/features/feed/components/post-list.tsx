'use client';

import { isApiError } from '@litmatch/api-client';

import { useFeed } from '../api';
import { FeedBanners } from './feed-banners';
import { PostCard } from './post-card';
import { PostComposer } from './post-composer';

export function PostList() {
  const feed = useFeed();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  const items = feed.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <div className="space-y-4">
      <PostComposer />
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
        <button
          type="button"
          className="h-10 w-full rounded-full border border-black/5 text-sm font-semibold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}
