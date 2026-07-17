import { PostList } from '../../../features/feed/components/post-list';
import { FeedIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';
import { FeedSidebar } from './feed-sidebar';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bảng tin' };

export default function FeedPage() {
  return (
    <section className="mx-auto w-full max-w-[1040px]">
      <div className="px-5">
        <PageHeader
          eyebrow="Câu chuyện mới"
          eyebrowIcon={<FeedIcon width={16} height={16} />}
          // action={
          //   <a
          //     href="#tao-bai-viet"
          //     aria-label="Tạo bài viết"
          //     className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl text-white"
          //   >
          //     <svg
          //       width={16}
          //       height={16}
          //       viewBox="0 0 24 24"
          //       fill="none"
          //       stroke="white"
          //       strokeWidth={2.5}
          //       aria-hidden
          //     >
          //       <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          //     </svg>
          //   </a>
          // }
        />
      </div>
      <div className="px-5 md:mx-auto md:max-w-[700px] lg:grid lg:max-w-none lg:grid-cols-[minmax(0,660px)_288px] lg:items-start lg:justify-center lg:gap-6">
        <div className="min-w-0">
          <PostList />
        </div>
        <div className="hidden lg:block">
          <FeedSidebar />
        </div>
      </div>
    </section>
  );
}
