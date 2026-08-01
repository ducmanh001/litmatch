import Link from 'next/link';

import { JsonLd } from '../../../shared/seo/json-ld';
import { createPublicMetadata } from '../../../shared/seo/public-metadata';
import { absoluteUrl, siteConfig } from '../../../shared/seo/site';
import {
  PublicCallout,
  PublicPage,
  PublicSection,
} from '../../../shared/ui/public-page';

import type { Metadata } from 'next';

const title = 'Về Litmatch';
const description =
  'Litmatch giúp mọi người bắt đầu một mối kết nối bằng cuộc trò chuyện tử tế, trước khi bị áp lực bởi hình ảnh hay kỳ vọng.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: title,
          description,
          url: absoluteUrl('/about'),
          isPartOf: {
            '@type': 'WebSite',
            name: siteConfig.name,
            url: siteConfig.url,
          },
        }}
      />
      <PublicPage
        eyebrow="Câu chuyện của chúng tôi"
        title={title}
        description={description}
      >
        <PublicSection heading="Bắt đầu bằng một cuộc trò chuyện">
          <p>
            Litmatch được xây dựng cho những người muốn làm quen theo nhịp
            riêng. Bạn có thể bắt đầu bằng Soul Match, nghe giọng nhau qua Voice
            Match hoặc tham gia một Party Room — rồi chỉ mở thêm thông tin khi
            cả hai đều thấy thoải mái.
          </p>
          <p>
            Mục tiêu của sản phẩm là tạo ra những cuộc trò chuyện chân thành
            hơn, với quyền chủ động, ranh giới và an toàn được đặt ngay trong
            trải nghiệm.
          </p>
        </PublicSection>

        <PublicSection heading="Các nguyên tắc chúng tôi theo đuổi">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                'Tự chủ',
                'Bạn chọn cách xuất hiện, cách kết nối và thời điểm dừng lại.',
              ],
              [
                'Chân thật',
                'Một cuộc trò chuyện có giá trị hơn việc lướt qua hàng trăm hồ sơ.',
              ],
              [
                'An toàn',
                'Báo cáo, chặn và hướng dẫn cộng đồng luôn có thể truy cập.',
              ],
            ].map(([heading, text]) => (
              <div
                key={heading}
                className="rounded-2xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-surf"
              >
                <h3 className="font-semibold text-slate-950 dark:text-white">
                  {heading}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </PublicSection>

        <PublicCallout>
          <p>
            Muốn bắt đầu?{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/login"
            >
              Tham gia Litmatch miễn phí
            </Link>{' '}
            hoặc đọc{' '}
            <Link
              className="ml-1 font-semibold text-irisl hover:underline"
              href="/community-guidelines"
            >
              Nguyên tắc cộng đồng
            </Link>{' '}
            trước khi kết nối.
          </p>
        </PublicCallout>
      </PublicPage>
    </>
  );
}
