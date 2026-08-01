import { createPublicMetadata } from '../../../shared/seo/public-metadata';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = createPublicMetadata({
  title: 'Trung tâm trợ giúp',
  description:
    'Tìm câu trả lời, gửi phản hồi và nhận hỗ trợ về tài khoản, an toàn, ghép đôi và thanh toán trên Litmatch.',
  path: '/help',
});

export default function HelpLayout({ children }: { children: ReactNode }) {
  return children;
}
