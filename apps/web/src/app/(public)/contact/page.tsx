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

const title = 'Liên hệ Litmatch';
const description =
  'Tìm đúng kênh để nhận hỗ trợ, báo cáo vấn đề hoặc gửi góp ý cho đội ngũ Litmatch.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: title,
          description,
          url: absoluteUrl('/contact'),
          isPartOf: {
            '@type': 'WebSite',
            name: siteConfig.name,
            url: siteConfig.url,
          },
        }}
      />
      <PublicPage eyebrow="Hỗ trợ" title={title} description={description}>
        <PublicSection heading="Trung tâm trợ giúp">
          <p>
            Với câu hỏi về tài khoản, ghép đôi, thanh toán, báo cáo hoặc quyền
            riêng tư, cách nhanh nhất là gửi yêu cầu từ
            <Link
              className="mx-1 font-semibold text-irisl hover:underline"
              href="/help"
            >
              Trung tâm trợ giúp
            </Link>
            . Bạn có thể theo dõi trạng thái phản hồi ngay trong tài khoản.
          </p>
          <Link
            href="/help"
            className="inline-flex rounded-full bg-irisl px-6 py-3 font-bold text-white shadow-lg shadow-iris/20 transition hover:-translate-y-0.5"
          >
            Mở Trung tâm trợ giúp
          </Link>
        </PublicSection>
        <PublicSection heading="Báo cáo an toàn">
          <p>
            Nếu một người dùng vi phạm nguyên tắc hoặc khiến bạn cảm thấy không
            an toàn, hãy dùng nút báo cáo trong sản phẩm và chặn tài khoản đó.
            Đừng gửi mật khẩu, mã OTP hoặc thông tin thanh toán trong nội dung
            báo cáo.
          </p>
          <Link
            href="/community-guidelines"
            className="font-semibold text-irisl hover:underline"
          >
            Đọc Nguyên tắc cộng đồng →
          </Link>
        </PublicSection>
        <PublicCallout>
          <p>
            Litmatch không yêu cầu bạn chuyển tiền cho nhân viên hỗ trợ. Nếu có
            yêu cầu đáng ngờ, hãy dừng trao đổi và gửi báo cáo qua kênh chính
            thức.
          </p>
        </PublicCallout>
      </PublicPage>
    </>
  );
}
