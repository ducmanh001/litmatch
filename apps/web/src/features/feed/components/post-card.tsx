import Link from 'next/link';

import { LikeButton } from './like-button';

import type { PostDto } from '../api';

export function PostCard({ post }: { post: PostDto }) {
  return (
    <article className="space-y-2 border-b border-border py-4">
      <p className="text-xs text-muted-foreground">
        {new Date(post.createdAt).toLocaleString('vi-VN')}
      </p>
      {post.content !== null && (
        <p className="whitespace-pre-wrap text-sm">{post.content}</p>
      )}
      {post.imageUrl !== null && (
        // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns cấu
        // hình trước (docs/13 § 13.9), wildcard domain ở đây sẽ mở SSRF qua image proxy nên
        // dùng <img> thuần cho luồng test này.
        <img
          src={post.imageUrl}
          alt="Ảnh bài viết"
          className="max-h-96 w-full rounded-md object-cover"
        />
      )}
      <div className="flex items-center gap-3">
        <LikeButton postId={post.id} fallbackLikeCount={post.likeCount} />
        <Link
          href={`/feed/${post.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {post.commentCount} bình luận
        </Link>
      </div>
    </article>
  );
}
