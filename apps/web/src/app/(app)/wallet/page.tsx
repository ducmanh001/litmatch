import { TopupPackages } from '../../../features/wallet/components/topup-packages';
import { WalletBalance } from '../../../features/wallet/components/wallet-balance';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ví kim cương' };

export default function WalletPage() {
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Ví kim cương</h1>
      <WalletBalance />
      <h2 className="text-lg font-medium">Nạp kim cương</h2>
      <TopupPackages />
    </section>
  );
}
