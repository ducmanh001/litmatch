import { AppChromeWithAuth } from './app-chrome';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChromeWithAuth>{children}</AppChromeWithAuth>;
}
