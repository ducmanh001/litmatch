import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { showToast } from '../../../shared/lib/toast-store';
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

const TXN_TYPE_LABEL: Record<string, string> = {
  iap_purchase: 'Nạp Diamond (IAP)',
  vip_purchase: 'Mua gói VIP',
  matching_speedup: 'Tăng tốc ghép đôi',
  calling_per_minute: 'Cước gọi thoại',
  gift_send: 'Tặng quà',
  avatar_purchase: 'Mua item avatar',
  reversal: 'Hoàn tiền',
  adjustment: 'Điều chỉnh',
};

export function EconomyPage() {
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
        : 'Có lỗi xảy ra, thử lại.';

  return (
    <section className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2.5">
        <Field
          htmlFor="lookup-user-id"
          label="User ID"
          className="min-w-[340px]"
        >
          <Input
            id="lookup-user-id"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="uuid của user (lấy từ trang Người dùng)"
          />
        </Field>
        <Button
          className="h-9"
          onClick={() => setLookupUserId(userIdInput.trim() || null)}
          disabled={userIdInput.trim() === ''}
        >
          Xem
        </Button>
      </Card>

      {lookupUserId === null && (
        <EmptyState title="Nhập User ID để xem ví + lịch sử giao dịch" />
      )}

      {lookupUserId !== null && (
        <>
          {wallet.isPending && <LoadingState label="Đang tải ví…" />}
          {wallet.error !== null && <ErrorState error={wallet.error} />}
          {wallet.data !== undefined && (
            <Card className="flex flex-wrap gap-9">
              <WalletStat label="Balance" value={`${wallet.data.balance} 💎`} />
              <WalletStat
                label="Earnings (PTS)"
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
            <LoadingState label="Đang tải giao dịch…" />
          )}
          {transactions.error !== null && (
            <ErrorState error={transactions.error} />
          )}
          {transactions.data !== undefined &&
            transactions.data.items.length === 0 && (
              <EmptyState title="User này chưa có giao dịch nào (do user chủ động thực hiện)" />
            )}

          {transactions.data !== undefined &&
            transactions.data.items.length > 0 && (
              <Card className="overflow-hidden p-0">
                <p className="px-[18px] pt-3.5 text-[11.5px] text-muted-foreground">
                  Chỉ hiện giao dịch user này chủ động thực hiện (nạp/mua/tặng)
                  — chưa gồm giao dịch chỉ là người nhận quà.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          Loại
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          Trạng thái
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          Diamond delta
                        </th>
                        <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                          Thời gian
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
                                    `Đã hoàn tiền giao dịch #${txn.id}`,
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
  const isReversal = txn.type === 'reversal';
  const isPositive = txn.diamondDelta.trim().startsWith('+');
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted">
      <td className="px-[18px] py-[13px]">
        {TXN_TYPE_LABEL[txn.type] ?? txn.type}
      </td>
      <td className="px-[18px] py-[13px]">
        <Pill variant={txn.status === 'completed' ? 'green' : 'neutral'}>
          {txn.status === 'completed' ? 'Hoàn tất' : 'Đã hoàn tiền'}
        </Pill>
      </td>
      <td
        className={
          isPositive
            ? 'px-[18px] py-[13px] font-extrabold text-success'
            : 'px-[18px] py-[13px] font-bold'
        }
      >
        {txn.diamondDelta}
      </td>
      <td className="px-[18px] py-[13px]">
        {new Date(txn.createdAt).toLocaleString('vi-VN')}
      </td>
      <td className="px-[18px] py-[13px] text-right">
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
        placeholder="Lý do hoàn tiền"
        className="h-8 w-[150px]"
      />
      <Button
        type="submit"
        size="sm"
        variant="destructive"
        disabled={disabled || reason.trim() === ''}
      >
        Hoàn tiền
      </Button>
    </form>
  );
}
