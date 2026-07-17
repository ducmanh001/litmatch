import { WalletTabs } from '../../../features/wallet/components/wallet-tabs';
import { WalletIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ví & VIP' };

export default function WalletPage() {
  return (
    <section className="mx-auto w-full max-w-2xl min-w-0 space-y-5 px-5">
      <PageHeader
        eyebrow="Số dư & gói VIP"
        eyebrowIcon={<WalletIcon width={16} height={16} />}
      />
      <WalletTabs />
    </section>
  );
}
