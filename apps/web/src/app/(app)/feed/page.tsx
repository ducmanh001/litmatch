import { PostList } from '../../../features/feed/components/post-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bảng tin' };

export default function FeedPage() {
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Bảng tin</h1>
      <PostList />
    </section>
  );
}
