'use client';

import { useState } from 'react';

import { TopupPackages } from './topup-packages';
import { VipPlans } from './vip-plans';
import { WalletBalance } from './wallet-balance';

type Tab = 'diamond' | 'vip';

export function WalletTabs() {
  const [tab, setTab] = useState<Tab>('diamond');

  const tabButtonClass = (active: boolean): string =>
    `border-b-2 pb-3 text-sm font-bold transition ${
      active ? 'border-irisl text-irisl' : 'border-transparent text-slate-400'
    }`;

  return (
    <div className="space-y-5">
      <WalletBalance
        onTopUp={() => setTab('diamond')}
        onUpgradeVip={() => setTab('vip')}
      />

      <div
        role="tablist"
        aria-label="Ví & VIP"
        className="flex gap-6 border-b border-black/5 dark:border-white/10"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'diamond'}
          onClick={() => setTab('diamond')}
          className={tabButtonClass(tab === 'diamond')}
        >
          Diamond
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'vip'}
          onClick={() => setTab('vip')}
          className={tabButtonClass(tab === 'vip')}
        >
          VIP
        </button>
      </div>

      {tab === 'diamond' ? (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Gói nạp
          </h2>
          <TopupPackages />
        </div>
      ) : (
        <VipPlans />
      )}
    </div>
  );
}
