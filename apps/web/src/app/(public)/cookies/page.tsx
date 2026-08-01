import Link from 'next/link';

import { JsonLd } from '../../../shared/seo/json-ld';
import { createPublicMetadata } from '../../../shared/seo/public-metadata';
import { absoluteUrl } from '../../../shared/seo/site';
import {
  PublicList,
  PublicPage,
  PublicSection,
} from '../../../shared/ui/public-page';

import type { Metadata } from 'next';

const title = 'Chính sách cookie và phân tích';
const description =
  'Cách Litmatch sử dụng cookie và công nghệ tương tự để duy trì phiên, bảo mật và cải thiện trải nghiệm.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/cookies',
});

export default function CookiesPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: absoluteUrl('/cookies'),
        }}
      />
      <PublicPage
        eyebrow="Minh bạch dữ liệu"
        title={title}
        description={description}
        updatedAt="31/07/2026"
      >
        <PublicSection heading="Cookie cần thiết">
          <p>
            Litmatch có thể dùng cookie hoặc bộ nhớ trình duyệt cần thiết để duy
            trì phiên đăng nhập, ghi nhớ lựa chọn giao diện/ngôn ngữ và hỗ trợ
            các cơ chế bảo mật. Nếu tắt nhóm này, một số chức năng có thể không
            hoạt động.
          </p>
        </PublicSection>
        <PublicSection heading="Phân tích trải nghiệm">
          <p>
            Khi bạn đồng ý, Litmatch có thể thu thập dữ liệu tương tác đã được
            giới hạn để phát hiện lỗi và cải thiện sản phẩm. Nội dung chữ và dữ
            liệu nhập được che trong công cụ replay theo cấu hình của sản phẩm.
          </p>
          <p>
            Bạn có thể thay đổi lựa chọn trong{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/privacy"
            >
              Cài đặt và quyền riêng tư
            </Link>
            . Từ chối phân tích không làm mất các tính năng cốt lõi.
          </p>
        </PublicSection>
        <PublicSection heading="Bạn có thể kiểm soát gì?">
          <PublicList
            items={[
              'Xoá cookie trong cài đặt trình duyệt của bạn.',
              'Từ chối hoặc thay đổi lựa chọn phân tích trong màn hình quyền riêng tư.',
              'Đọc đầy đủ cách Litmatch xử lý dữ liệu trong Chính sách quyền riêng tư.',
            ]}
          />
        </PublicSection>
        <p>
          Chính sách này có thể thay đổi khi sản phẩm hoặc nhà cung cấp kỹ thuật
          thay đổi. Khi thay đổi đáng kể, Litmatch sẽ cập nhật ngày hiệu lực và
          thông báo phù hợp.
        </p>
      </PublicPage>
    </>
  );
}
