import Link from 'next/link';

import { JsonLd } from '../../../shared/seo/json-ld';
import { createPublicMetadata } from '../../../shared/seo/public-metadata';
import { absoluteUrl } from '../../../shared/seo/site';
import {
  PublicCallout,
  PublicList,
  PublicPage,
  PublicSection,
} from '../../../shared/ui/public-page';

import type { Metadata } from 'next';

const title = 'Nguyên tắc cộng đồng';
const description =
  'Các nguyên tắc giúp Litmatch là nơi trò chuyện tôn trọng, an toàn và có quyền chủ động cho mọi người.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/community-guidelines',
});

export default function CommunityGuidelinesPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: absoluteUrl('/community-guidelines'),
          about: { '@type': 'Thing', name: 'Community safety' },
        }}
      />
      <PublicPage
        eyebrow="An toàn cộng đồng"
        title={title}
        description={description}
        updatedAt="31/07/2026"
      >
        <PublicCallout>
          <p className="font-semibold text-slate-950 dark:text-white">
            Litmatch dành cho người từ 18 tuổi trở lên. Nếu bạn gặp nguy hiểm
            ngay lập tức, hãy liên hệ dịch vụ khẩn cấp tại nơi bạn đang ở.
          </p>
        </PublicCallout>
        <PublicSection heading="Hãy làm">
          <PublicList
            items={[
              'Nói chuyện với sự tôn trọng và tôn trọng ranh giới của người khác.',
              'Xin phép trước khi chuyển sang cuộc gọi, chia sẻ hình ảnh hoặc đề nghị gặp mặt.',
              'Dùng công cụ chặn và báo cáo khi một tài khoản vi phạm hoặc khiến bạn không thoải mái.',
              'Bảo vệ tài khoản của bạn: không chia sẻ mật khẩu, mã OTP hoặc thông tin thanh toán.',
            ]}
          />
        </PublicSection>
        <PublicSection heading="Không được phép">
          <PublicList
            items={[
              'Quấy rối, đe doạ, bắt nạt, thù ghét hoặc cố ý làm nhục người khác.',
              'Mạo danh, lừa đảo, tống tiền, dụ dỗ chuyển tiền hoặc thu thập thông tin riêng tư.',
              'Nội dung tình dục không có sự đồng thuận, khai thác trẻ vị thành niên hoặc gạ gẫm người dưới 18 tuổi.',
              'Spam, quảng cáo trái phép, phát tán mã độc hoặc hướng dẫn gây hại.',
              'Dùng nhiều tài khoản để né lệnh cấm hoặc thao túng các tính năng của cộng đồng.',
            ]}
          />
        </PublicSection>
        <PublicSection heading="Báo cáo và xử lý">
          <p>
            Bạn có thể báo cáo người dùng hoặc nội dung từ các điểm báo cáo
            trong sản phẩm. Đội ngũ Litmatch có thể xem xét, giới hạn tính năng,
            gỡ nội dung hoặc khoá tài khoản khi cần để bảo vệ cộng đồng.
          </p>
          <p>
            Để gửi phản hồi hoặc cần hướng dẫn, hãy vào{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/help"
            >
              Trung tâm trợ giúp
            </Link>
            . Khi báo cáo, hãy cung cấp ngữ cảnh cần thiết và không đăng công
            khai thông tin nhạy cảm của người khác.
          </p>
        </PublicSection>
      </PublicPage>
    </>
  );
}
