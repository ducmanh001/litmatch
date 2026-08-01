import { siteConfig, absoluteUrl } from '../shared/seo/site';

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/home',
          '/feed',
          '/matching',
          '/friends',
          '/chat',
          '/party',
          '/discovery',
          '/movie-match',
          '/palm-match',
          '/video',
          '/wallet',
          '/profile',
          '/users',
          '/more',
          '/privacy',
          '/login',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteConfig.url,
  };
}
