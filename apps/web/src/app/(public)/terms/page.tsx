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

const title = 'Điều khoản dịch vụ';
const description =
  'Các điều khoản áp dụng khi bạn tạo tài khoản và sử dụng tính năng kết nối, nội dung, thanh toán trên Litmatch.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: absoluteUrl('/terms'),
          dateModified: '2026-07-31',
        }}
      />
      <PublicPage
        eyebrow="Pháp lý"
        title={title}
        description={description}
        updatedAt="31/07/2026"
      >
        <PublicCallout>
          <p>
            Bằng việc tạo tài khoản hoặc tiếp tục sử dụng Litmatch, bạn xác nhận
            đã đọc và đồng ý với các điều khoản này, cùng{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/privacy-policy"
            >
              Chính sách quyền riêng tư
            </Link>{' '}
            và{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/community-guidelines"
            >
              Nguyên tắc cộng đồng
            </Link>
            .
          </p>
        </PublicCallout>
        <PublicSection heading="1. Điều kiện sử dụng">
          <p>
            Litmatch dành cho người từ 18 tuổi trở lên có đủ năng lực để đồng ý
            với điều khoản. Bạn chịu trách nhiệm về thông tin cung cấp, hoạt
            động trên tài khoản và việc tuân thủ pháp luật nơi mình sử dụng dịch
            vụ.
          </p>
        </PublicSection>
        <PublicSection heading="2. Tài khoản và an toàn">
          <PublicList
            items={[
              'Giữ mã OTP, thông tin đăng nhập và thiết bị an toàn; không cho người khác sử dụng tài khoản của bạn.',
              'Không mạo danh người khác, tạo tài khoản để né hạn chế hoặc dùng dịch vụ cho mục đích trái pháp luật.',
              'Thông báo sớm cho Litmatch nếu bạn nghi ngờ tài khoản bị truy cập trái phép.',
            ]}
          />
        </PublicSection>
        <PublicSection heading="3. Nội dung và hành vi">
          <p>
            Bạn giữ quyền đối với nội dung mình tạo nhưng cấp cho Litmatch quyền
            cần thiết để lưu trữ, hiển thị, phân phối và xử lý nội dung đó nhằm
            vận hành tính năng bạn sử dụng. Bạn phải có quyền đăng nội dung và
            không được vi phạm quyền của người khác.
          </p>
          <p>
            Cấm quấy rối, đe doạ, lừa đảo, nội dung tình dục không có sự đồng
            thuận, khai thác trẻ vị thành niên, spam, mã độc và các hành vi
            trong{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/community-guidelines"
            >
              Nguyên tắc cộng đồng
            </Link>
            .
          </p>
        </PublicSection>
        <PublicSection heading="4. Tính năng trả phí">
          <p>
            Diamond, VIP và các tính năng trả phí được mô tả cùng mức giá, thời
            hạn và điều kiện trước khi bạn xác nhận. Quyền sử dụng có thể phụ
            thuộc trạng thái giao dịch và chính sách của nhà cung cấp thanh
            toán. Không tự ý chia sẻ, bán lại hoặc khai thác tính năng trả phí
            ngoài mục đích cá nhân hợp pháp.
          </p>
          <p>
            Nếu giao dịch có vấn đề, hãy gửi yêu cầu qua{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/help"
            >
              Trung tâm trợ giúp
            </Link>{' '}
            và cung cấp mã giao dịch phù hợp; không gửi thông tin thẻ hoặc mã
            OTP.
          </p>
        </PublicSection>
        <PublicSection heading="5. Tạm ngừng và chấm dứt">
          <p>
            Litmatch có thể giới hạn, tạm ngừng hoặc chấm dứt quyền truy cập khi
            cần để bảo vệ người dùng, điều tra vi phạm, xử lý rủi ro hoặc tuân
            thủ pháp luật. Khi phù hợp, bạn có thể gửi phản hồi hoặc khiếu nại
            qua kênh hỗ trợ.
          </p>
        </PublicSection>
        <PublicSection heading="6. Thay đổi dịch vụ và điều khoản">
          <p>
            Sản phẩm có thể được cập nhật, thay đổi hoặc tạm ngừng một phần. Khi
            điều khoản thay đổi đáng kể, Litmatch sẽ cập nhật ngày hiệu lực và
            thông báo bằng phương thức phù hợp. Việc tiếp tục sử dụng sau ngày
            hiệu lực nghĩa là bạn chấp nhận phiên bản mới.
          </p>
        </PublicSection>
        <PublicSection heading="7. Liên hệ">
          <p>
            Nếu có câu hỏi về điều khoản hoặc muốn gửi yêu cầu, hãy dùng{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/contact"
            >
              trang Liên hệ
            </Link>{' '}
            và Trung tâm trợ giúp của Litmatch.
          </p>
        </PublicSection>
      </PublicPage>
    </>
  );
}
