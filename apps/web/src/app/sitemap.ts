import { INDEXABLE_ROUTES, absoluteUrl } from '../shared/seo/site';

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map((path, index) => ({
    url: absoluteUrl(path),
    lastModified: new Date('2026-07-31T00:00:00.000Z'),
    changeFrequency: path === '/' || path === '/help' ? 'weekly' : 'monthly',
    priority:
      index === 0
        ? 1
        : path === '/privacy-policy' || path === '/terms'
          ? 0.6
          : 0.8,
  }));
}
