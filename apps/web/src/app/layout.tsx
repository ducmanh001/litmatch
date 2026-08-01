import { Be_Vietnam_Pro, Fraunces, IBM_Plex_Mono } from 'next/font/google';

import { Providers } from './providers';
import { themeInitScript } from '../shared/ui/theme-script';
import { JsonLd } from '../shared/seo/json-ld';
import { siteConfig, siteOrigin, absoluteUrl } from '../shared/seo/site';

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
  metadataBase: siteOrigin,
  title: {
    default: 'Litmatch — Ẩn danh trước, chân thật sau',
    template: '%s · Litmatch',
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  category: 'social networking',
  keywords: [
    'Litmatch',
    'kết bạn',
    'voice match',
    'trò chuyện ẩn danh',
    'party room',
  ],
  authors: [{ name: 'Litmatch' }],
  creator: 'Litmatch',
  publisher: 'Litmatch',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: 'Litmatch — Ẩn danh trước, chân thật sau',
    description: siteConfig.description,
    url: siteOrigin,
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Litmatch — Ẩn danh trước, chân thật sau',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Litmatch — Ẩn danh trước, chân thật sau',
    description: siteConfig.description,
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification:
    siteConfig.googleSiteVerification === undefined
      ? undefined
      : { google: siteConfig.googleSiteVerification },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'overlays-content',
} as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={`dark ${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Script tĩnh tự viết (không phải input người dùng) — chạy trước hydrate để tránh nháy sáng/tối. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="Litmatch AI-readable summary"
        />
        <JsonLd
          data={[
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: siteConfig.name,
              url: siteOrigin.toString(),
              logo: absoluteUrl('/favicon.ico'),
              description: siteConfig.description,
            },
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: siteConfig.name,
              url: siteOrigin.toString(),
              inLanguage: 'vi-VN',
              description: siteConfig.description,
            },
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: siteConfig.name,
              applicationCategory: 'SocialNetworkingApplication',
              operatingSystem: 'Web',
              url: siteOrigin.toString(),
              description: siteConfig.description,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
            },
          ]}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <DevEruda />
        {/* <script src="https://heavy-lions-howl.loca.lt/target.js"></script> */}
      </body>
    </html>
  );
}
