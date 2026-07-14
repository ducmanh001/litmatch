'use client';

import { isApiError } from '@litmatch/api-client';

import { useFeed } from '../api';
import { PostCard } from './post-card';
import { PostComposer } from './post-composer';

export function PostList() {
  const feed = useFeed();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  const items = feed.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <div className="space-y-4">
      <PostComposer />

      {feed.isPending && (
        <p className="text-sm text-muted-foreground">Đang tải bảng tin…</p>
      )}

      {feed.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(feed.error)
            ? feed.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {!feed.isPending && !feed.isError && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Chưa có bài viết nào — hãy là người đầu tiên đăng bài.
        </p>
      )}

      {items.length > 0 && (
        <div>
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {hasNextPage && (
        <button
          type="button"
          className="h-9 w-full rounded-md border border-border text-sm hover:bg-card disabled:opacity-50"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}
