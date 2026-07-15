'use client';

import Link from 'next/link';

import { useUserTimeline } from '../../feed/api';

export function ProfilePostsGrid({ userId }: { userId: string }) {
  const timeline = useUserTimeline(userId);
  const posts = timeline.data?.items ?? [];

  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Bài viết của bạn</h2>
        <Link href="/feed" className="text-xs font-bold text-irisl">
          Xem trên Bảng tin →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/feed/${post.id}`}
            className="relative aspect-square overflow-hidden rounded-xl bg-surf2"
          >
            {post.imageUrl !== null ? (
              // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns
              // cấu hình trước (docs/13 § 13.9); dùng <img> thuần như post-card.tsx.
              <img
                src={post.imageUrl}
                alt="Ảnh bài viết"
                className="h-full w-full object-cover"
              />
            ) : (
              <p className="flex h-full items-end p-2.5 text-[11px] font-semibold leading-snug text-white">
                {post.content}
              </p>
            )}
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {post.likeCount}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
