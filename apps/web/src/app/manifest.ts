import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Litmatch',
    short_name: 'Litmatch',
    description: 'Ẩn danh trước, chân thật sau — kết nối qua giọng nói.',
    start_url: '/',
    display: 'standalone',
    background_color: '#17121c',
    theme_color: '#7d5ac7',
    icons: [{ src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' }],
  };
}
