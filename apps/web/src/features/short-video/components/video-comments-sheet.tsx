'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useEffect, useId, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { cn } from '../../../shared/lib/cn';
import { useCreateVideoComment, useVideoComments } from '../api';
import { createVideoCommentSchema } from '../create-video-comment-schema';

import type { CreateVideoCommentForm } from '../create-video-comment-schema';

function VideoCommentList({
  videoId,
  open,
}: {
  videoId: string;
  open: boolean;
}) {
  const comments = useVideoComments(videoId, { enabled: open });
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
            <li key={comment.id}>
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

function VideoCommentComposer({ videoId }: { videoId: string }) {
  const form = useForm<CreateVideoCommentForm>({
    resolver: zodResolver(createVideoCommentSchema),
    defaultValues: { content: '' },
  });
  const createComment = useCreateVideoComment(videoId);

  const message =
    form.formState.errors.content?.message ??
    (isApiError(createComment.error)
      ? createComment.error.message
      : createComment.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit(({ content }) => {
    createComment.mutate(content, {
      onSuccess: (commented) => {
        if (commented === undefined) return;
        form.reset();
      },
    });
  });

  return (
    <form className="space-y-1.5" onSubmit={onSubmit} noValidate>
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label="Nội dung bình luận"
          placeholder="Viết bình luận..."
          className="h-10 min-w-0 flex-1 rounded-full bg-slate-100 px-4 text-sm text-slate-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-iris dark:bg-surf2 dark:text-white"
          {...form.register('content')}
        />
        <button
          type="submit"
          className="shrink-0 text-sm font-bold text-irisl disabled:opacity-50"
          disabled={createComment.isPending}
        >
          {createComment.isPending ? 'Đang gửi…' : 'Gửi'}
        </button>
      </div>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}

/**
 * Mobile: bottom-sheet overlay thật (trượt lên trên video). Desktop: panel tĩnh mở rộng ngay
 * cạnh video (không che), đúng layouts/web/video.html — 2 hành vi khác hẳn nhau theo breakpoint
 * nên dùng class CSS thuần `.video-comments-sheet` (global.css) thay vì chỉ Tailwind variant.
 * Luôn render (không return null khi đóng) để có transition mở/đóng mượt như mockup.
 */
export function VideoCommentsSheet({
  videoId,
  commentCount,
  open,
  onClose,
}: {
  videoId: string | null;
  commentCount: number;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [onClose, open]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Đóng bình luận"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}
      <div
        role="dialog"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'video-comments-sheet flex flex-col bg-white shadow-2xl shadow-black/30 dark:bg-surf',
          open && 'open',
        )}
      >
        <div className="flex shrink-0 items-center justify-center pb-1 pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 py-3 dark:border-white/10">
          <p
            id={titleId}
            className="text-sm font-bold text-slate-900 dark:text-white"
          >
            {commentCount} bình luận
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-surf2 dark:text-slate-300"
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {videoId !== null && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-3 text-slate-900 dark:text-white">
              <VideoCommentList videoId={videoId} open={open} />
            </div>
            <div className="shrink-0 border-t border-black/5 px-4 py-3 dark:border-white/10">
              <VideoCommentComposer videoId={videoId} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
