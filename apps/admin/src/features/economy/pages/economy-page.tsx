import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { showToast } from '../../../shared/lib/toast-store';
import { useT } from '../../../shared/i18n/catalog';
import { useLocale } from '../../../shared/i18n/locale-store';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
import { Pill } from '../../../shared/ui/pill';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import {
  useAdminTransactions,
  useAdminWallet,
  useRefundTransaction,
} from '../api';

import type { AdminTransactionDto } from '../api';

const TXN_TYPE_LABEL_KEYS = {
  iap_purchase: 'economy.type.iapPurchase',
  vip_purchase: 'economy.type.vipPurchase',
  matching_speedup: 'economy.type.matchingSpeedup',
  calling_per_minute: 'economy.type.callingPerMinute',
  gift_send: 'economy.type.giftSend',
  avatar_purchase: 'economy.type.avatarPurchase',
  reversal: 'economy.type.reversal',
  adjustment: 'economy.type.adjustment',
} as const;

export function EconomyPage() {
  const t = useT();
  const [userIdInput, setUserIdInput] = useState('');
  const [lookupUserId, setLookupUserId] = useState<string | null>(null);

  const wallet = useAdminWallet(lookupUserId);
  const transactions = useAdminTransactions(lookupUserId);
  const refund = useRefundTransaction(lookupUserId ?? '');

  const mutationError = (err: unknown): string | undefined =>
    err === null || err === undefined
      ? undefined
      : isApiError(err)
        ? err.message
        : t('common.tryAgain');

  return (
    <section className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2.5">
        <Field
          htmlFor="lookup-user-id"
          label={t('economy.userId')}
          className="min-w-[340px]"
        >
          <Input
            id="lookup-user-id"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder={t('economy.userIdPlaceholder')}
          />
        </Field>
        <Button
          className="h-9"
          onClick={() => setLookupUserId(userIdInput.trim() || null)}
          disabled={userIdInput.trim() === ''}
        >
          {t('economy.view')}
        </Button>
      </Card>

      {lookupUserId === null && <EmptyState title={t('economy.enterUserId')} />}

      {lookupUserId !== null && (
        <>
          {wallet.isPending && (
            <LoadingState label={t('economy.loadingWallet')} />
          )}
          {wallet.error !== null && <ErrorState error={wallet.error} />}
          {wallet.data !== undefined && (
            <Card className="flex flex-wrap gap-9">
              <WalletStat
                label={t('economy.balance')}
                value={`${wallet.data.balance} 💎`}
              />
              <WalletStat
                label={t('economy.earnings')}
                value={String(wallet.data.earnings)}
              />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  VIP
                </div>
                {wallet.data.vipTier !== null ? (
                  <Pill variant="accent" className="uppercase tracking-wide">
                    {wallet.data.vipTier}
                  </Pill>
                ) : (
                  <div className="text-[21px] font-extrabold tracking-tight">
                    —
                  </div>
                )}
              </div>
            </Card>
          )}

          {transactions.isPending && (
            <LoadingState label={t('economy.loadingTransactions')} />
          )}
          {transactions.error !== null && (
            <ErrorState error={transactions.error} />
          )}
          {transactions.data !== undefined &&
            transactions.data.items.length === 0 && (
              <EmptyState title={t('economy.noTransactions')} />
            )}

          {transactions.data !== undefined &&
            transactions.data.items.length > 0 && (
              <Card className="overflow-hidden p-0">
                <p className="px-[18px] pt-3.5 text-[11.5px] text-muted-foreground">
                  {t('economy.transactionsHint')}
                </p>
                <div className="overflow-x-auto">
                  <table className="responsive-table w-full border-collapse text-[13px] md:min-w-[640px]">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          {t('economy.type')}
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          {t('economy.status')}
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          {t('economy.delta')}
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          {t('economy.time')}
                        </th>
                        <th className="px-[18px] py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.data.items.map((txn) => (
                        <TransactionRow
                          key={txn.id}
                          txn={txn}
                          refundPending={refund.isPending}
                          onRefund={(reason) =>
                            refund.mutate(
                              { transactionId: txn.id, reason },
                              {
                                onSuccess: () =>
                                  showToast(
                                    t('economy.refundSuccess', { id: txn.id }),
                                  ),
                              },
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

          {mutationError(refund.error) !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError(refund.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function WalletStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="text-[21px] font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function TransactionRow({
  txn,
  onRefund,
  refundPending,
}: {
  txn: AdminTransactionDto;
  onRefund: (reason: string) => void;
  refundPending: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const isReversal = txn.type === 'reversal';
  const isPositive = txn.diamondDelta.trim().startsWith('+');
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted">
      <td data-label={t('economy.type')} className="px-[18px] py-[13px]">
        {TXN_TYPE_LABEL_KEYS[txn.type as keyof typeof TXN_TYPE_LABEL_KEYS] !==
        undefined
          ? t(TXN_TYPE_LABEL_KEYS[txn.type as keyof typeof TXN_TYPE_LABEL_KEYS])
          : txn.type}
      </td>
      <td data-label={t('economy.status')} className="px-[18px] py-[13px]">
        <Pill variant={txn.status === 'completed' ? 'green' : 'neutral'}>
          {txn.status === 'completed'
            ? t('economy.completed')
            : t('economy.refunded')}
        </Pill>
      </td>
      <td
        data-label={t('economy.delta')}
        className={
          isPositive
            ? 'px-[18px] py-[13px] font-extrabold text-success'
            : 'px-[18px] py-[13px] font-bold'
        }
      >
        {txn.diamondDelta}
      </td>
      <td data-label={t('economy.time')} className="px-[18px] py-[13px]">
        {new Date(txn.createdAt).toLocaleString(
          locale === 'vi' ? 'vi-VN' : 'en-US',
        )}
      </td>
      <td data-label="" className="px-[18px] py-[13px] text-right">
        {!isReversal && txn.status !== 'reversed' && (
          <RefundForm onSubmit={onRefund} disabled={refundPending} />
        )}
      </td>
    </tr>
  );
}

function RefundForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (reason: string) => void;
  disabled: boolean;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim() === '') return;
        onSubmit(reason.trim());
        setReason('');
      }}
    >
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('economy.refundReason')}
        className="h-8 w-[150px]"
      />
      <Button
        type="submit"
        size="sm"
        variant="destructive"
        disabled={disabled || reason.trim() === ''}
      >
        {t('economy.refund')}
      </Button>
    </form>
  );
}
