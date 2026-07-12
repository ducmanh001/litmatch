import { Providers } from './providers';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';

export const metadata: Metadata = {
  title: {
    default: 'Litmatch — Kết nối qua giọng nói',
    template: '%s · Litmatch',
  },
  description:
    'Ghép đôi ẩn danh, voice call, party room và kết bạn qua giọng nói. Tham gia Litmatch ngay trên trình duyệt.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
