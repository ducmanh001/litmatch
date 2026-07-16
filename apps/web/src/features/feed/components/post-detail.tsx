'use client';

import { isApiError } from '@litmatch/api-client';

import { usePost } from '../api';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { PostCard } from './post-card';

export function PostDetail({ postId }: { postId: string }) {
  const post = usePost(postId);

  if (post.isPending) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải bài viết…
      </p>
    );
  }

  if (post.isError) {
    const message = isApiError(post.error)
      ? post.error.message
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

  if (post.data === undefined) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Không tìm thấy bài viết.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PostCard post={post.data} commentHref="#binh-luan" />

      <section id="binh-luan" aria-label="Bình luận" className="space-y-4">
        <CommentComposer postId={postId} />
        <CommentList postId={postId} />
      </section>
    </div>
  );
}
