import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Cài đặt và quyền riêng tư',
  robots: { index: false, follow: false },
};

export default function PrivacySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
