import { PostDetail } from '../../../../features/feed/components/post-detail';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bài viết' };

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return (
    <section className="mx-auto w-full max-w-xl min-w-0 px-5">
      <PostDetail postId={postId} />
    </section>
  );
}
