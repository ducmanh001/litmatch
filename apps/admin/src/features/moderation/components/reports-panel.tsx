import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { showToast } from '../../../shared/lib/toast-store';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Pill } from '../../../shared/ui/pill';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { useDismissReport, useResolveReport, useReportsList } from '../api';

import type { AdminReportDto } from '../api';

const PAGE_SIZE = 20;

const REASON_LABEL: Record<AdminReportDto['reason'], string> = {
  harassment: 'Quấy rối',
  spam: 'Spam',
  underage: 'Vị thành niên',
  inappropriate_content: 'Nội dung không phù hợp',
  other: 'Khác',
};

const STATUS_LABEL: Record<AdminReportDto['status'], string> = {
  pending: 'Chờ xử lý',
  resolved: 'Đã xử lý',
  dismissed: 'Đã bỏ qua',
};

export function ReportsPanel() {
  const [status, setStatus] = useState<AdminReportDto['status'] | ''>(
    'pending',
  );
  const [offset, setOffset] = useState(0);
  const { data, isPending, error } = useReportsList(
    status === '' ? undefined : status,
    offset,
  );
  const resolveReport = useResolveReport();
  const dismissReport = useDismissReport();

  const actionError = (err: unknown): string | null => {
    if (err === null || err === undefined) return null;
    return isApiError(err) ? err.message : 'Có lỗi xảy ra, thử lại.';
  };
  const pendingActionError =
    actionError(resolveReport.error) ?? actionError(dismissReport.error);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Field htmlFor="report-status-filter" label="Trạng thái">
          <select
            id="report-status-filter"
            className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminReportDto['status'] | '');
              setOffset(0);
            }}
          >
            <option value="pending">Chờ xử lý</option>
            <option value="resolved">Đã xử lý</option>
            <option value="dismissed">Đã bỏ qua</option>
            <option value="">Tất cả</option>
          </select>
        </Field>
      </Card>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có report nào khớp bộ lọc" />
      )}

      {data !== undefined && data.items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead className="border-b border-border">
                <tr>
                  {['Lý do', 'Mô tả', 'Target user', 'Trạng thái'].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                  <th className="px-[18px] py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-border align-top last:border-0 hover:bg-muted"
                  >
                    <td className="px-[18px] py-[13px]">
                      {REASON_LABEL[report.reason]}
                    </td>
                    <td className="max-w-[230px] truncate px-[18px] py-[13px] text-muted-foreground">
                      {report.description ?? '—'}
                    </td>
                    <td className="px-[18px] py-[13px] font-mono text-[11.5px] text-muted-foreground">
                      {report.targetUserId}
                    </td>
                    <td className="px-[18px] py-[13px]">
                      <Pill
                        variant={
                          report.status === 'pending'
                            ? 'gold'
                            : report.status === 'resolved'
                              ? 'green'
                              : 'neutral'
                        }
                      >
                        {STATUS_LABEL[report.status]}
                      </Pill>
                    </td>
                    <td className="px-[18px] py-[13px] text-right whitespace-nowrap">
                      {report.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={dismissReport.isPending}
                            onClick={() =>
                              dismissReport.mutate(report.id, {
                                onSuccess: () =>
                                  showToast(`Đã bỏ qua report #${report.id}`),
                              })
                            }
                          >
                            Bỏ qua
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={resolveReport.isPending}
                            onClick={() =>
                              resolveReport.mutate(report.id, {
                                onSuccess: () =>
                                  showToast(`Đã xử lý report #${report.id}`),
                              })
                            }
                          >
                            Đã xử lý
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 pt-4 pb-1 text-[12.5px] text-muted-foreground">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Trang trước
              </Button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} /{' '}
                {data.total}
              </span>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </Card>
      )}

      {pendingActionError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {pendingActionError}
        </p>
      )}
    </div>
  );
}
