'use client';

import { isApiError } from '@litmatch/api-client';

import { usePost } from '../api';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { LikeButton } from './like-button';

export function PostDetail({ postId }: { postId: string }) {
  const post = usePost(postId);

  if (post.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải bài viết…</p>;
  }

  if (post.isError) {
    const message = isApiError(post.error)
      ? post.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (post.data === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Không tìm thấy bài viết.</p>
    );
  }

  return (
    <div className="space-y-4">
      <article className="space-y-2 border-b border-border pb-4">
        <p className="text-xs text-muted-foreground">
          {new Date(post.data.createdAt).toLocaleString('vi-VN')}
        </p>
        {post.data.content !== null && (
          <p className="whitespace-pre-wrap text-sm">{post.data.content}</p>
        )}
        {post.data.imageUrl !== null && (
          // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns cấu
          // hình trước (docs/13 § 13.9), wildcard domain ở đây sẽ mở SSRF qua image proxy nên
          // dùng <img> thuần cho luồng test này.
          <img
            src={post.data.imageUrl}
            alt="Ảnh bài viết"
            className="max-h-96 w-full rounded-md object-cover"
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
