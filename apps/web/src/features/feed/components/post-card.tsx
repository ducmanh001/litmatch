import Link from 'next/link';

import { formatRelativeTime } from '../../../shared/lib/format-relative-time';
import { LikeButton } from './like-button';
import { PostAuthorAvatar } from './post-author-avatar';

import type { PostDto } from '../api';
import type { SVGProps } from 'react';

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

export function PostCard({ post }: { post: PostDto }) {
  return (
    <article className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf">
      <div className="mb-3 flex items-center gap-3">
        <PostAuthorAvatar seed={post.authorUserId} />
        <div className="flex-1">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {formatRelativeTime(post.createdAt)}
          </p>
        </div>
      </div>
      {post.content !== null && (
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">
          {post.content}
        </p>
      )}
      {post.imageUrl !== null && (
        // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns cấu
        // hình trước (docs/13 § 13.9), wildcard domain ở đây sẽ mở SSRF qua image proxy nên
        // dùng <img> thuần cho luồng test này.
        <img
          src={post.imageUrl}
          alt="Ảnh bài viết"
          className="mb-3 h-40 w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-center gap-5 pt-1">
        <LikeButton postId={post.id} fallbackLikeCount={post.likeCount} />
        <Link
          href={`/feed/${post.id}`}
          className="flex items-center gap-1.5 text-slate-500 transition hover:text-irisl dark:text-slate-400"
        >
          <CommentIcon />
          <span className="text-xs font-semibold">
            {post.commentCount} bình luận
          </span>
        </Link>
      </div>
    </article>
  );
}
