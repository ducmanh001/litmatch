'use client';

import Link from 'next/link';

import { useUserTimeline } from '../../feed/api';
import { PostCard } from '../../feed/components/post-card';
import { useTranslation } from '../../../shared/i18n/messages';

export function ProfilePostsGrid({
  userId,
  variant = 'grid',
}: {
  userId: string;
  variant?: 'grid' | 'feed';
}) {
  const timeline = useUserTimeline(userId);
  const t = useTranslation();
  const posts = timeline.data?.items ?? [];

  if (timeline.isPending) {
    return (
      <div aria-label="Đang tải bài viết" className="space-y-3">
        <div className="h-32 animate-pulse rounded-2xl bg-muted dark:bg-surf2" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted dark:bg-surf2" />
      </div>
    );
  }

  if (timeline.isError) {
    return (
      <p
        role="alert"
        className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-200"
      >
        Không thể tải bài viết của hồ sơ này.
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/70 px-4 py-5 text-center text-sm text-muted-foreground dark:bg-surf2/70 dark:text-white/60">
        Chưa có bài viết công khai.
      </p>
    );
  }

  if (variant === 'feed') {
    return (
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">{t('profile.posts')}</h2>
        <Link href="/feed" className="text-xs font-bold text-irisl">
          {t('profile.viewFeed')}
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
              // Ảnh đã được core-api resolve từ asset cloud; dùng <img> thuần như post-card.tsx.
              <img
                src={post.imageUrl}
                alt={t('profile.postImageAlt')}
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
