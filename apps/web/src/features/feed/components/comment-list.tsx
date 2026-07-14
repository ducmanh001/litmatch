'use client';

import { isApiError } from '@litmatch/api-client';

import { useComments } from '../api';

export function CommentList({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = comments;

  const items = comments.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  if (comments.isPending) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải bình luận…
      </p>
    );
  }

  if (comments.isError) {
    const message = isApiError(comments.error)
      ? comments.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p
        role="alert"
        className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {message}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Chưa có bình luận nào.
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((comment) => (
            <li
              key={comment.id}
              className="rounded-2xl border border-black/5 bg-white px-3 py-2.5 dark:border-white/5 dark:bg-surf"
            >
              <p className="text-sm">{comment.content}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {new Date(comment.createdAt).toLocaleString('vi-VN')}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          className="h-9 w-full rounded-full border border-black/5 text-sm font-semibold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm bình luận'}
        </button>
      )}
    </div>
  );
}
