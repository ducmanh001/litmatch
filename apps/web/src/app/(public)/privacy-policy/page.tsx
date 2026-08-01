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

const title = 'Chính sách quyền riêng tư';
const description =
  'Tìm hiểu dữ liệu Litmatch thu thập, mục đích sử dụng, cách bảo vệ và các lựa chọn kiểm soát của bạn.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/privacy-policy',
});

export default function PrivacyPolicyPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: absoluteUrl('/privacy-policy'),
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
            Bản chính sách này giải thích cách Litmatch xử lý thông tin khi bạn
            sử dụng website và các tính năng trong sản phẩm. Vui lòng đọc cùng{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/terms"
            >
              Điều khoản dịch vụ
            </Link>{' '}
            và hỏi hỗ trợ nếu có điểm chưa rõ.
          </p>
        </PublicCallout>
        <PublicSection heading="1. Dữ liệu chúng tôi có thể xử lý">
          <PublicList
            items={[
              'Thông tin tài khoản và đăng nhập như số điện thoại, thông tin xác thực từ nhà cung cấp xã hội, tên hiển thị và dữ liệu hồ sơ bạn chọn cung cấp.',
              'Nội dung bạn tạo hoặc gửi như bài viết, bình luận, tin nhắn, ảnh, video, phản hồi hỗ trợ và báo cáo.',
              'Dữ liệu sử dụng kỹ thuật như thiết bị, trình duyệt, địa chỉ IP, nhật ký lỗi, trạng thái phiên và thông tin cần thiết để chống gian lận/bảo vệ dịch vụ.',
              'Dữ liệu vị trí gần đúng chỉ khi tính năng và quyền thiết bị cho phép; bạn có thể tắt hiển thị khoảng cách hoặc quyền vị trí.',
              'Thông tin giao dịch, gói Diamond/VIP và trạng thái thanh toán do hệ thống thanh toán trả về. Litmatch không yêu cầu bạn gửi số thẻ qua chat.',
            ]}
          />
        </PublicSection>
        <PublicSection heading="2. Mục đích sử dụng">
          <PublicList
            items={[
              'Cung cấp, cá nhân hoá và duy trì các tính năng ghép đôi, trò chuyện, phòng voice, feed và hồ sơ.',
              'Xác thực tài khoản, bảo vệ người dùng, phát hiện lạm dụng, xử lý báo cáo và thực thi nguyên tắc cộng đồng.',
              'Xử lý giao dịch, hỗ trợ khách hàng, gửi thông báo cần thiết và giải quyết tranh chấp.',
              'Đo lường lỗi và cải thiện trải nghiệm khi bạn đã lựa chọn đồng ý với phân tích không bắt buộc.',
              'Tuân thủ nghĩa vụ pháp lý và bảo vệ quyền, tài sản, an toàn của Litmatch và người dùng.',
            ]}
          />
        </PublicSection>
        <PublicSection heading="3. Chia sẻ và nhà cung cấp">
          <p>
            Litmatch chỉ chia sẻ thông tin ở mức cần thiết với các nhà cung cấp
            hỗ trợ hạ tầng, xác thực, lưu trữ, thanh toán, quan sát lỗi hoặc hỗ
            trợ khách hàng theo hợp đồng và hướng dẫn của Litmatch. Chúng tôi có
            thể cung cấp thông tin khi pháp luật yêu cầu hoặc để xử lý nguy cơ
            gian lận, lạm dụng và an toàn nghiêm trọng.
          </p>
          <p>
            Litmatch không bán thông tin cá nhân của bạn. Nội dung công khai
            hoặc thông tin hồ sơ bạn chọn hiển thị có thể được người dùng khác
            nhìn thấy theo cài đặt và tính năng tương ứng.
          </p>
        </PublicSection>
        <PublicSection heading="4. Lưu giữ và bảo mật">
          <p>
            Chúng tôi lưu thông tin trong thời gian cần thiết cho mục đích đã
            nêu, để vận hành tài khoản, giải quyết tranh chấp, thực hiện nghĩa
            vụ pháp lý và bảo vệ dịch vụ. Thời gian cụ thể phụ thuộc loại dữ
            liệu, tính năng và yêu cầu áp dụng.
          </p>
          <p>
            Litmatch áp dụng các biện pháp kỹ thuật và tổ chức phù hợp, nhưng
            không có hệ thống truyền hoặc lưu trữ nào an toàn tuyệt đối. Bạn
            cũng cần bảo vệ mã OTP, thiết bị và thông tin đăng nhập của mình.
          </p>
        </PublicSection>
        <PublicSection heading="5. Lựa chọn và quyền của bạn">
          <PublicList
            items={[
              'Chỉnh sửa hồ sơ, quản lý hiển thị, chặn và báo cáo trong sản phẩm.',
              'Từ chối phân tích không bắt buộc trong màn hình quyền riêng tư.',
              'Yêu cầu truy cập, chỉnh sửa, xoá hoặc giải thích về dữ liệu của bạn, tuỳ theo pháp luật áp dụng.',
              'Gửi yêu cầu qua Trung tâm trợ giúp; Litmatch có thể cần xác minh danh tính trước khi xử lý.',
            ]}
          />
          <p>
            Bạn có thể mở{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/privacy"
            >
              Cài đặt và quyền riêng tư
            </Link>{' '}
            hoặc{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/help"
            >
              Trung tâm trợ giúp
            </Link>{' '}
            để bắt đầu.
          </p>
        </PublicSection>
        <PublicSection heading="6. Trẻ em">
          <p>
            Litmatch dành cho người từ 18 tuổi trở lên. Chúng tôi không chủ đích
            thu thập dữ liệu của trẻ em. Nếu bạn cho rằng một người chưa đủ tuổi
            đã tạo tài khoản, hãy báo cáo qua kênh hỗ trợ.
          </p>
        </PublicSection>
        <PublicSection heading="7. Thay đổi chính sách">
          <p>
            Chúng tôi có thể cập nhật chính sách khi sản phẩm, nhà cung cấp hoặc
            yêu cầu pháp lý thay đổi. Phiên bản mới sẽ được đăng tại trang này
            với ngày cập nhật mới; thay đổi quan trọng sẽ được thông báo bằng
            kênh phù hợp.
          </p>
        </PublicSection>
      </PublicPage>
    </>
  );
}
