import { siteConfig, absoluteUrl } from './site';

import type { Metadata } from 'next';

const OG_IMAGE = {
  url: '/og-image.svg',
  width: 1200,
  height: 630,
  alt: 'Litmatch — Ẩn danh trước, chân thật sau',
};

export function createPublicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const fullTitle = `${title} · ${siteConfig.name}`;
  const url = absoluteUrl(path);

  return {
    title,
    description,
    keywords: ['Litmatch', 'kết bạn', 'voice match', 'trò chuyện ẩn danh'],
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: siteConfig.locale,
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      url,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
