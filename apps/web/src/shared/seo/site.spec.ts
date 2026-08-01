import { describe, expect, it } from 'vitest';

import { createPublicMetadata } from './public-metadata';
import { absoluteUrl, INDEXABLE_ROUTES, siteConfig } from './site';

describe('public SEO contract', () => {
  it('uses one configured origin for canonical and sitemap URLs', () => {
    expect(absoluteUrl('/privacy-policy')).toBe(
      `${siteConfig.url}/privacy-policy`,
    );
    expect(INDEXABLE_ROUTES).toContain('/terms');
    expect(INDEXABLE_ROUTES).not.toContain('/privacy');
    expect(INDEXABLE_ROUTES).not.toContain('/home');
  });

  it('builds a canonical public metadata contract', () => {
    const metadata = createPublicMetadata({
      title: 'Tính năng Litmatch',
      description: 'Mô tả tính năng.',
      path: '/features',
    });

    expect(metadata.alternates?.canonical).toBe('/features');
    expect(metadata.openGraph).toMatchObject({
      url: `${siteConfig.url}/features`,
      type: 'website',
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });
});
