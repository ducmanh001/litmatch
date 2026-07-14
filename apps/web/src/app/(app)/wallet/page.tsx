import { TopupPackages } from '../../../features/wallet/components/topup-packages';
import { WalletBalance } from '../../../features/wallet/components/wallet-balance';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ví kim cương' };

export default function WalletPage() {
  return (
    <section className="space-y-5 px-5">
      <h1 className="font-display pt-2 text-xl font-semibold italic">
        Ví kim cương
      </h1>
      <WalletBalance />
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Nạp kim cương
        </h2>
        <TopupPackages />
      </div>
    </section>
  );
}
