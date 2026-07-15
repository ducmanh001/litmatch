import Link from 'next/link';

import { WalletTabs } from '../../../features/wallet/components/wallet-tabs';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ví & VIP' };

export default function WalletPage() {
  return (
    <section className="space-y-5 px-5">
      <div className="flex items-center gap-3 pt-2">
        <Link
          href="/profile"
          aria-label="Quay lại hồ sơ"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="font-display text-xl font-semibold italic">Ví & VIP</h1>
      </div>
      <WalletTabs />
    </section>
  );
}
