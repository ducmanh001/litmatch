import Link from 'next/link';

import { JsonLd } from '../../../shared/seo/json-ld';
import { createPublicMetadata } from '../../../shared/seo/public-metadata';
import { absoluteUrl } from '../../../shared/seo/site';
import { PublicPage, PublicSection } from '../../../shared/ui/public-page';

import type { Metadata } from 'next';

const title = 'Tính năng Litmatch';
const description =
  'Khám phá các cách kết nối trên Litmatch: Soul Match, Voice Match, Party Room, Feed, Video và Diamond & VIP.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/features',
});

const FEATURES = [
  [
    'Soul Match',
    'Trò chuyện ẩn danh trong thời gian ngắn để cảm nhận sự hợp nhau trước khi mở khoá hồ sơ.',
  ],
  [
    'Voice Match',
    'Nghe giọng nói thật và trò chuyện trực tiếp trước khi quyết định kết nối tiếp.',
  ],
  [
    'Party Room',
    'Tham gia phòng voice nhiều người, lên mic, làm quen và tặng quà trong cộng đồng.',
  ],
  ['Feed', 'Chia sẻ trạng thái, ảnh và cảm xúc để giữ liên lạc với cộng đồng.'],
  ['Video', 'Khám phá các khoảnh khắc ngắn và tương tác với nội dung phù hợp.'],
  [
    'Diamond & VIP',
    'Sử dụng Diamond và các gói VIP theo điều khoản hiển thị trong ứng dụng.',
  ],
] as const;

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: absoluteUrl('/features'),
          mainEntity: FEATURES.map(([name, featureDescription]) => ({
            '@type': 'Service',
            name,
            description: featureDescription,
            provider: { '@type': 'Organization', name: 'Litmatch' },
          })),
        }}
      />
      <PublicPage eyebrow="Sản phẩm" title={title} description={description}>
        <PublicSection heading="Chọn cách kết nối phù hợp với bạn">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(([name, featureDescription]) => (
              <article
                key={name}
                className="rounded-2xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-surf"
              >
                <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                  {name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {featureDescription}
                </p>
              </article>
            ))}
          </div>
        </PublicSection>
        <PublicSection heading="An toàn là một phần của sản phẩm">
          <p>
            Bạn có thể chặn, báo cáo và quản lý cách hiển thị thông tin cá nhân.
            Hãy đọc
            <Link
              className="mx-1 font-semibold text-irisl hover:underline"
              href="/community-guidelines"
            >
              Nguyên tắc cộng đồng
            </Link>
            để biết những hành vi được mong đợi khi sử dụng Litmatch.
          </p>
        </PublicSection>
      </PublicPage>
    </>
  );
}
