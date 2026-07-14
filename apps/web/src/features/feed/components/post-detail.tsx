'use client';

import { isApiError } from '@litmatch/api-client';

import { usePost } from '../api';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { LikeButton } from './like-button';
import { ProfileIcon } from '../../../shared/ui/icons';

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
      <article className="space-y-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surf2 text-white">
            <ProfileIcon width={18} height={18} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {new Date(post.data.createdAt).toLocaleString('vi-VN')}
          </p>
        </div>
        {post.data.content !== null && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {post.data.content}
          </p>
        )}
        {post.data.imageUrl !== null && (
          // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns cấu
          // hình trước (docs/13 § 13.9), wildcard domain ở đây sẽ mở SSRF qua image proxy nên
          // dùng <img> thuần cho luồng test này.
          <img
            src={post.data.imageUrl}
            alt="Ảnh bài viết"
            className="max-h-96 w-full rounded-xl object-cover"
          />
        )}
        <LikeButton
          postId={post.data.id}
          fallbackLikeCount={post.data.likeCount}
        />
      </article>

      <CommentComposer postId={postId} />
      <CommentList postId={postId} />
    </div>
  );
}
