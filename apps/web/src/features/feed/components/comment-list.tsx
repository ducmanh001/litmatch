'use client';

import { isApiError } from '@litmatch/api-client';

import { useComments } from '../api';

export function CommentList({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = comments;

  const items = comments.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  if (comments.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải bình luận…</p>;
  }

  if (comments.isError) {
    const message = isApiError(comments.error)
      ? comments.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((comment) => (
            <li key={comment.id} className="rounded-md bg-card px-3 py-2">
              <p className="text-sm">{comment.content}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(comment.createdAt).toLocaleString('vi-VN')}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          className="h-8 w-full rounded-md border border-border text-sm hover:bg-card disabled:opacity-50"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm bình luận'}
        </button>
      )}
    </div>
  );
}
