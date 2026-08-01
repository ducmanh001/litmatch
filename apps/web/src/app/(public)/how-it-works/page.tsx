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

const title = 'Litmatch hoạt động như thế nào?';
const description =
  'Tìm hiểu cách bắt đầu một cuộc trò chuyện, ghép đôi, mở khoá kết nối và chủ động giữ an toàn trên Litmatch.';

export const metadata: Metadata = createPublicMetadata({
  title,
  description,
  path: '/how-it-works',
});

const steps = [
  [
    '1',
    'Chọn cách bắt đầu',
    'Vào Soul Match để chat, Voice Match để gọi thoại hoặc khám phá Party Room.',
  ],
  [
    '2',
    'Trò chuyện trong nhịp an toàn',
    'Bạn không cần chia sẻ thông tin riêng tư ngay từ đầu. Hãy dừng, rời phòng hoặc chặn nếu không thoải mái.',
  ],
  [
    '3',
    'Cả hai cùng thích',
    'Khi hai bên cùng muốn kết nối tiếp, Litmatch mở khoá bước tiếp theo theo tính năng đang dùng.',
  ],
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: title,
          description,
          url: absoluteUrl('/how-it-works'),
          step: steps.map(([position, name, text]) => ({
            '@type': 'HowToStep',
            position: Number(position),
            name,
            text,
          })),
        }}
      />
      <PublicPage
        eyebrow="Bắt đầu dễ dàng"
        title={title}
        description={description}
      >
        <PublicSection heading="Ba bước để bắt đầu">
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map(([number, heading, text]) => (
              <div
                key={number}
                className="rounded-2xl border border-black/5 bg-white p-6 dark:border-white/10 dark:bg-surf"
              >
                <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-iris/10 text-lg font-semibold text-irisl">
                  {number}
                </span>
                <h2 className="mt-5 font-semibold text-slate-950 dark:text-white">
                  {heading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </PublicSection>
        <PublicSection heading="Một vài nguyên tắc hữu ích">
          <PublicList
            items={[
              'Không chia sẻ số điện thoại, địa chỉ, mã OTP hoặc thông tin tài chính với người lạ.',
              'Tôn trọng sự đồng ý; một lời từ chối hoặc rời cuộc trò chuyện luôn cần được tôn trọng.',
              'Báo cáo hành vi đáng ngờ và chặn tài khoản khiến bạn không an toàn.',
            ]}
          />
        </PublicSection>
        <PublicCallout>
          <p>
            Cần hỗ trợ? Xem{' '}
            <Link
              className="font-semibold text-irisl hover:underline"
              href="/help"
            >
              Trung tâm trợ giúp
            </Link>{' '}
            hoặc đọc
            <Link
              className="ml-1 font-semibold text-irisl hover:underline"
              href="/community-guidelines"
            >
              Nguyên tắc cộng đồng
            </Link>
            .
          </p>
        </PublicCallout>
      </PublicPage>
    </>
  );
}
