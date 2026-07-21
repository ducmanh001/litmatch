'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useLocale } from '../i18n/locale-store';
import { getUserDisplayName } from '../lib/user-display-name';
import { cn } from '../lib/cn';
import { PlaceholderAvatar } from './placeholder-avatar';

import type { ApiSchema } from '@litmatch/api-client';

type ContentComment = Pick<
  ApiSchema<'CommentDto'>,
  'id' | 'authorUserId' | 'author' | 'content' | 'createdAt'
>;

/** Presentation dùng chung cho comment của feed và short-video; feature vẫn sở hữu query/API. */
export function ContentCommentList({
  comments,
  error,
  isPending,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  variant = 'plain',
}: {
  comments: readonly ContentComment[];
  error: unknown;
  isPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  variant?: 'card' | 'plain';
}) {
  const locale = useLocale();

  if (isPending) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải bình luận…
      </p>
    );
  }

  if (error !== null) {
    const message = isApiError(error)
      ? error.message
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
      {comments.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Chưa có bình luận nào.
        </p>
      )}

      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const author = comment.author ?? {
              id: comment.authorUserId,
              nickname: getUserDisplayName(comment.author, locale),
              avatarId: comment.authorUserId,
            };
            return (
              <li
                key={comment.id}
                className={cn(
                  'flex gap-2.5',
                  variant === 'card' &&
                    'rounded-2xl border border-black/5 bg-white px-3 py-2.5 dark:border-white/5 dark:bg-surf',
                )}
              >
                <Link
                  href={`/users/${author.id}`}
                  aria-label={`Xem hồ sơ ${author.nickname}`}
                >
                  <PlaceholderAvatar seed={author.avatarId} alt="" size={32} />
                </Link>
                <div className="min-w-0">
                  <Link
                    href={`/users/${author.id}`}
                    className="text-sm font-bold hover:underline"
                  >
                    {author.nickname}
                  </Link>
                  <p
                    className={cn(
                      'text-sm',
                      variant === 'card' &&
                        'whitespace-pre-wrap [overflow-wrap:anywhere]',
                    )}
                  >
                    {comment.content}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {new Date(comment.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          className="h-9 w-full rounded-full border border-black/5 text-sm font-semibold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm bình luận'}
        </button>
      )}
    </div>
  );
}
