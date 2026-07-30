import { isApiError } from '@litmatch/api-client';
import { CheckSquare, Copy, Save, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { cn } from '../../../shared/lib/cn';
import { copyToClipboard } from '../../../shared/lib/copy-to-clipboard';
import { showToast } from '../../../shared/lib/toast-store';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Modal, ModalBody, ModalHeader } from '../../../shared/ui/modal';
import { Pill } from '../../../shared/ui/pill';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import {
  useBulkReportAction,
  useDismissReport,
  useReportsList,
  useResolveReport,
} from '../api';

import type { KeyboardEvent } from 'react';
import type {
  AdminReportDto,
  BulkReportAction,
  BulkReportFailure,
} from '../api';

const PAGE_SIZE = 20;
const SAVED_FILTERS_KEY = 'litmatch-admin-report-filters';

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

const VALID_STATUSES = new Set(['pending', 'resolved', 'dismissed', '']);

function readSavedFilters(): AdminReportDto['status'][] {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(SAVED_FILTERS_KEY) ?? '[]',
    );
    return Array.isArray(stored)
      ? stored.filter(
          (value): value is AdminReportDto['status'] =>
            typeof value === 'string' &&
            value !== '' &&
            VALID_STATUSES.has(value),
        )
      : [];
  } catch {
    return [];
  }
}

export function ReportsPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = (
    statusParam === 'all'
      ? ''
      : statusParam !== null && VALID_STATUSES.has(statusParam)
        ? statusParam
        : 'pending'
  ) as AdminReportDto['status'] | '';
  const caseId = searchParams.get('case');
  const requestedOffset = Number(searchParams.get('offset') ?? '0');
  const offset =
    Number.isInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFailures, setBulkFailures] = useState<BulkReportFailure[]>([]);
  const [pendingBulkAction, setPendingBulkAction] =
    useState<BulkReportAction | null>(null);
  const [savedFilters, setSavedFilters] =
    useState<AdminReportDto['status'][]>(readSavedFilters);
  const { data, isPending, error } = useReportsList(
    status === '' ? undefined : status,
    offset,
  );
  const resolveReport = useResolveReport();
  const dismissReport = useDismissReport();
  const bulkAction = useBulkReportAction();

  const pendingReports = useMemo(
    () => data?.items.filter((report) => report.status === 'pending') ?? [],
    [data],
  );
  const selectedOnPage = pendingReports.filter((report) =>
    selectedIds.has(report.id),
  );
  const selectedReportIds = selectedOnPage.map((report) => report.id);

  useEffect(() => {
    if (caseId === null) return;
    const matches = Array.from(
      document.querySelectorAll<HTMLElement>('[data-case-id]'),
    );
    const visibleMatch = matches.find(
      (element) =>
        element.dataset.caseId === caseId &&
        element.getClientRects().length > 0,
    );
    visibleMatch?.scrollIntoView({ block: 'center' });
  }, [caseId, data]);

  function updateStatus(nextStatus: AdminReportDto['status'] | ''): void {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === '') next.set('status', 'all');
    else next.set('status', nextStatus);
    next.delete('case');
    next.delete('offset');
    setSearchParams(next);
    setSelectedIds(new Set());
    setBulkFailures([]);
  }

  function updateOffset(nextOffset: number): void {
    const next = new URLSearchParams(searchParams);
    if (nextOffset === 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    next.delete('case');
    setSearchParams(next);
    setSelectedIds(new Set());
    setBulkFailures([]);
  }

  function saveCurrentFilter(): void {
    if (status === '') {
      showToast('Bộ lọc “Tất cả” đã là mặc định', 'warn');
      return;
    }
    if (savedFilters.includes(status)) {
      showToast('Bộ lọc này đã được lưu', 'warn');
      return;
    }
    const next = [...savedFilters, status];
    sessionStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    setSavedFilters(next);
    showToast(`Đã lưu bộ lọc “${STATUS_LABEL[status]}”`);
  }

  function toggleSelected(reportId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds((current) => {
      const allSelected =
        pendingReports.length > 0 &&
        pendingReports.every((report) => current.has(report.id));
      return allSelected
        ? new Set()
        : new Set(pendingReports.map((report) => report.id));
    });
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLElement>,
    report: AdminReportDto,
  ): void {
    const rows = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
        '[data-report-row]',
      ) ?? [],
    );
    const index = rows.indexOf(event.currentTarget);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      rows[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus();
    } else if (event.key === ' ' && report.status === 'pending') {
      event.preventDefault();
      toggleSelected(report.id);
    }
  }

  async function copyCaseLink(report: AdminReportDto): Promise<void> {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'reports');
    url.searchParams.set('status', report.status);
    url.searchParams.set('case', report.id);
    if (offset === 0) url.searchParams.delete('offset');
    else url.searchParams.set('offset', String(offset));
    const copied = await copyToClipboard(url.toString());
    showToast(
      copied
        ? `Đã sao chép deep link case #${report.id}`
        : 'Không thể sao chép deep link trong trình duyệt này',
      copied ? undefined : 'warn',
    );
  }

  const actionError = (err: unknown): string | null => {
    if (err === null || err === undefined) return null;
    return isApiError(err) ? err.message : 'Có lỗi xảy ra, thử lại.';
  };
  const pendingActionError =
    actionError(resolveReport.error) ??
    actionError(dismissReport.error) ??
    actionError(bulkAction.error);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <Field htmlFor="report-status-filter" label="Trạng thái">
          <select
            id="report-status-filter"
            className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            value={status}
            onChange={(event) =>
              updateStatus(event.target.value as AdminReportDto['status'] | '')
            }
          >
            <option value="pending">Chờ xử lý</option>
            <option value="resolved">Đã xử lý</option>
            <option value="dismissed">Đã bỏ qua</option>
            <option value="">Tất cả</option>
          </select>
        </Field>
        <Button variant="outline" onClick={saveCurrentFilter}>
          <Save className="size-4" aria-hidden />
          Lưu bộ lọc
        </Button>
        {savedFilters.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Bộ lọc đã lưu">
            {savedFilters.map((savedStatus) => (
              <button
                key={savedStatus}
                type="button"
                onClick={() => updateStatus(savedStatus)}
                aria-pressed={status === savedStatus}
                className="rounded-full border border-border bg-muted px-3 py-2 text-xs font-semibold hover:border-primary aria-pressed:border-primary aria-pressed:text-primary"
              >
                {STATUS_LABEL[savedStatus]}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedReportIds.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-primary/40">
          <strong className="mr-auto text-sm">
            Đã chọn {selectedReportIds.length} case
          </strong>
          <span className="text-xs text-muted-foreground">
            Mỗi case được ghi audit riêng
          </span>
          <Button
            variant="outline"
            onClick={() => setPendingBulkAction('dismiss')}
          >
            Bỏ qua hàng loạt
          </Button>
          <Button
            variant="destructive"
            onClick={() => setPendingBulkAction('resolve')}
          >
            Xử lý hàng loạt
          </Button>
        </Card>
      )}

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có report nào khớp bộ lọc" />
      )}
      {caseId !== null &&
        data !== undefined &&
        !data.items.some((report) => report.id === caseId) && (
          <p role="status" className="rounded-xl bg-gold-bg p-3 text-sm">
            Case #{caseId} không nằm trong trang kết quả hiện tại. Hãy đổi bộ
            lọc hoặc chuyển trang; deep link vẫn được giữ trên URL.
          </p>
        )}

      {data !== undefined && data.items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="responsive-table w-full border-collapse text-[13px] md:min-w-[760px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="w-12 px-3 py-3">
                    <button
                      type="button"
                      aria-label="Chọn tất cả report đang chờ trên trang"
                      onClick={toggleAll}
                      disabled={pendingReports.length === 0}
                      className="rounded p-1 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30"
                    >
                      {pendingReports.length > 0 &&
                      selectedOnPage.length === pendingReports.length ? (
                        <CheckSquare className="size-4" aria-hidden />
                      ) : (
                        <Square className="size-4" aria-hidden />
                      )}
                    </button>
                  </th>
                  {['Case / Lý do', 'Mô tả', 'Target user', 'Trạng thái'].map(
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
                    data-report-row
                    data-case-id={report.id}
                    tabIndex={0}
                    onKeyDown={(event) => handleRowKeyDown(event, report)}
                    className={cn(
                      'border-b border-border align-top last:border-0 hover:bg-muted focus-visible:bg-primary-soft focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring',
                      caseId === report.id && 'bg-primary-soft',
                    )}
                  >
                    <td
                      data-label="Chọn"
                      className="px-3 py-[13px] text-center"
                    >
                      {report.status === 'pending' && (
                        <SelectCaseButton
                          selected={selectedIds.has(report.id)}
                          reportId={report.id}
                          onClick={() => toggleSelected(report.id)}
                        />
                      )}
                    </td>
                    <td
                      data-label="Case / Lý do"
                      className="px-[18px] py-[13px]"
                    >
                      <div>{REASON_LABEL[report.reason]}</div>
                      <div className="mt-1 max-w-40 truncate font-mono text-[10px] text-muted-foreground">
                        {report.id}
                      </div>
                    </td>
                    <td
                      data-label="Mô tả"
                      className="max-w-[230px] truncate px-[18px] py-[13px] text-muted-foreground"
                    >
                      {typeof report.description === 'string'
                        ? report.description
                        : '—'}
                    </td>
                    <td
                      data-label="Target user"
                      className="px-[18px] py-[13px] font-mono text-[11.5px] text-muted-foreground"
                    >
                      {report.targetUserId}
                    </td>
                    <td data-label="Trạng thái" className="px-[18px] py-[13px]">
                      <ReportStatus report={report} />
                    </td>
                    <td data-label="" className="px-[18px] py-[13px]">
                      <ReportActions
                        report={report}
                        busy={
                          resolveReport.isPending || dismissReport.isPending
                        }
                        onCopyLink={() => void copyCaseLink(report)}
                        onDismiss={() =>
                          dismissReport.mutate(report.id, {
                            onSuccess: () =>
                              showToast(`Đã bỏ qua report #${report.id}`),
                          })
                        }
                        onResolve={() =>
                          resolveReport.mutate(report.id, {
                            onSuccess: () =>
                              showToast(`Đã xử lý report #${report.id}`),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 px-4 py-4 text-[12.5px] text-muted-foreground">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => updateOffset(Math.max(0, offset - PAGE_SIZE))}
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
                onClick={() => updateOffset(offset + PAGE_SIZE)}
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
      {bulkFailures.length > 0 && (
        <Card role="alert" className="border-destructive/40 bg-destructive-bg">
          <strong className="text-sm">
            {bulkFailures.length} case cập nhật thất bại
          </strong>
          <ul className="mt-2 space-y-2 text-xs">
            {bulkFailures.map((failure) => (
              <li key={failure.reportId} className="rounded-lg bg-card p-2">
                <div className="font-mono">
                  #{failure.reportId} · {failure.code}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {failure.message}
                </div>
                {failure.traceId !== '' && (
                  <button
                    type="button"
                    className="mt-1 font-mono text-primary hover:underline"
                    onClick={async () => {
                      const copied = await copyToClipboard(failure.traceId);
                      showToast(
                        copied
                          ? 'Đã sao chép trace ID'
                          : 'Không thể sao chép trace ID',
                        copied ? undefined : 'warn',
                      );
                    }}
                  >
                    trace: {failure.traceId} · sao chép
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={pendingBulkAction !== null}
        onClose={() => setPendingBulkAction(null)}
        labelledBy="bulk-report-title"
      >
        <ModalHeader
          title="Xác nhận thao tác hàng loạt"
          titleId="bulk-report-title"
          onClose={() => setPendingBulkAction(null)}
        />
        <ModalBody>
          <p className="text-sm">
            Bạn sắp{' '}
            <strong>
              {pendingBulkAction === 'resolve' ? 'xử lý' : 'bỏ qua'}{' '}
              {selectedReportIds.length} report
            </strong>
            . Backend sẽ xác thực quyền, case tồn tại và ghi audit log riêng cho
            từng case.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Batch không atomic: nếu một case lỗi, các case đã thành công vẫn
            được giữ và UI sẽ báo số case thất bại.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingBulkAction(null)}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={bulkAction.isPending}
              onClick={() => {
                if (pendingBulkAction === null) return;
                setBulkFailures([]);
                bulkAction.mutate(
                  {
                    reportIds: selectedReportIds,
                    action: pendingBulkAction,
                  },
                  {
                    onSuccess: (result) => {
                      setSelectedIds(
                        new Set(
                          result.failures.map((failure) => failure.reportId),
                        ),
                      );
                      setBulkFailures(result.failures);
                      setPendingBulkAction(null);
                      if (result.failures.length === 0) {
                        showToast(
                          `Đã cập nhật ${result.succeededIds.length} case và ghi audit`,
                        );
                      } else {
                        showToast(
                          `${result.succeededIds.length} thành công, ${result.failures.length} thất bại`,
                          'warn',
                        );
                      }
                    },
                  },
                );
              }}
            >
              {bulkAction.isPending ? 'Đang xử lý…' : 'Xác nhận'}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}

function SelectCaseButton({
  selected,
  reportId,
  onClick,
}: {
  selected: boolean;
  reportId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} report ${reportId}`}
      aria-pressed={selected}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
    >
      {selected ? (
        <CheckSquare className="size-4" aria-hidden />
      ) : (
        <Square className="size-4" aria-hidden />
      )}
    </button>
  );
}

function ReportStatus({ report }: { report: AdminReportDto }) {
  return (
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
  );
}

function ReportActions({
  report,
  busy,
  onCopyLink,
  onDismiss,
  onResolve,
}: {
  report: AdminReportDto;
  busy: boolean;
  onCopyLink: () => void;
  onDismiss: () => void;
  onResolve: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Sao chép deep link report ${report.id}`}
        title="Sao chép deep link"
        onClick={onCopyLink}
      >
        <Copy className="size-4" aria-hidden />
      </Button>
      {report.status === 'pending' && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onDismiss}
          >
            Bỏ qua
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onResolve}
          >
            Đã xử lý
          </Button>
        </>
      )}
    </div>
  );
}
