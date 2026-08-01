import { env } from '../env';

export const siteConfig = {
  name: 'Litmatch',
  description:
    'Nền tảng kết nối qua trò chuyện, voice match và party room — ẩn danh trước, chân thật sau.',
  locale: 'vi_VN',
  url: env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/u, ''),
  googleSiteVerification: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
} as const;

export const siteOrigin = new URL(siteConfig.url);

export function absoluteUrl(path: string): string {
  return new URL(path, siteOrigin).toString();
}

/** Chỉ các trang marketing/thông tin có nội dung ổn định mới được đưa vào sitemap. */
export const INDEXABLE_ROUTES = [
  '/',
  '/about',
  '/features',
  '/how-it-works',
  '/community-guidelines',
  '/contact',
  '/cookies',
  '/help',
  '/privacy-policy',
  '/terms',
] as const;
