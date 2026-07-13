import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
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
      <h1 className="text-2xl font-semibold">Economy</h1>

      <Card className="flex flex-wrap items-end gap-4">
        <Field htmlFor="lookup-user-id" label="User ID">
          <Input
            id="lookup-user-id"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="uuid của user (lấy từ trang Người dùng)"
            className="w-96"
          />
        </Field>
        <Button
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
            <Card className="flex gap-8">
              <div>
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="text-xl font-semibold">{wallet.data.balance}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Earnings (PTS)</p>
                <p className="text-xl font-semibold">{wallet.data.earnings}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">VIP</p>
                <p className="text-xl font-semibold">
                  {wallet.data.vipTier ?? '—'}
                </p>
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
              <Card className="overflow-x-auto p-0">
                <p className="px-4 pt-3 text-xs text-muted-foreground">
                  Chỉ hiện giao dịch user này chủ động thực hiện (nạp/mua/tặng)
                  — chưa gồm giao dịch chỉ là người nhận quà.
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Loại</th>
                      <th className="px-4 py-2 font-medium">Trạng thái</th>
                      <th className="px-4 py-2 font-medium">Diamond delta</th>
                      <th className="px-4 py-2 font-medium">Thời gian</th>
                      <th className="px-4 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.data.items.map((txn) => (
                      <TransactionRow
                        key={txn.id}
                        txn={txn}
                        refundPending={refund.isPending}
                        onRefund={(reason) =>
                          refund.mutate({ transactionId: txn.id, reason })
                        }
                      />
                    ))}
                  </tbody>
                </table>
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
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-2">{txn.type}</td>
      <td className="px-4 py-2">{txn.status}</td>
      <td className="px-4 py-2">{txn.diamondDelta}</td>
      <td className="px-4 py-2">{new Date(txn.createdAt).toLocaleString()}</td>
      <td className="px-4 py-2 text-right">
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
        className="h-8 w-48"
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
