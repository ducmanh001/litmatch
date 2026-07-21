import { Be_Vietnam_Pro, Fraunces, IBM_Plex_Mono } from 'next/font/google';

import { Providers } from './providers';
import { themeInitScript } from '../shared/ui/theme-script';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import { DevEruda } from './dev-eruda';

const fontDisplay = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
});
const fontBody = Be_Vietnam_Pro({
  subsets: ['latin'],
  variable: '--font-be-vietnam-pro',
  weight: ['400', '500', '600', '700'],
});
const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
});

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
    <html
      lang="vi"
      className={`dark ${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Script tĩnh tự viết (không phải input người dùng) — chạy trước hydrate để tránh nháy sáng/tối. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <DevEruda />
        {/* <script src="https://heavy-lions-howl.loca.lt/target.js"></script> */}
      </body>
    </html>
  );
}
