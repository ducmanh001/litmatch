import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
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

export function ModerationPage() {
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
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Kiểm duyệt</h1>

      <Card className="flex flex-wrap items-end gap-4">
        <Field htmlFor="report-status-filter" label="Trạng thái">
          <select
            id="report-status-filter"
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdminReportDto['status'] | '');
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
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Lý do</th>
                <th className="px-4 py-2 font-medium">Mô tả</th>
                <th className="px-4 py-2 font-medium">Target user</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((report) => (
                <tr
                  key={report.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="px-4 py-2">{REASON_LABEL[report.reason]}</td>
                  <td className="px-4 py-2 max-w-xs truncate">
                    {report.description ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {report.targetUserId}
                  </td>
                  <td className="px-4 py-2">{report.status}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {report.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={dismissReport.isPending}
                          onClick={() => dismissReport.mutate(report.id)}
                        >
                          Bỏ qua
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={resolveReport.isPending}
                          onClick={() => resolveReport.mutate(report.id)}
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
        </Card>
      )}

      {pendingActionError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {pendingActionError}
        </p>
      )}

      {data !== undefined && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Trang trước
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} /{' '}
            {data.total}
          </span>
          <Button
            variant="ghost"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Trang sau
          </Button>
        </div>
      )}
    </section>
  );
}
