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
import { Tabs } from '../../../shared/ui/tabs';
import { useDismissReport, useResolveReport, useReportsList } from '../api';
import {
  useApproveVideo,
  usePendingVideos,
  usePublishedVideos,
  useRejectVideo,
  useRemoveVideo,
} from '../videos-api';

import type { AdminReportDto } from '../api';
import type { AdminVideoDto } from '../videos-api';
import { useAdminSupportTickets, useUpdateSupportTicket } from '../support-api';
import type { AdminSupportTicketDto } from '../support-api';

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

type ModTab = 'reports' | 'pending-videos' | 'published-videos' | 'support';

export function ModerationPage() {
  const [tab, setTab] = useState<ModTab>('reports');

  return (
    <section>
      <Tabs
        tabs={[
          { value: 'reports', label: 'Báo cáo người dùng' },
          { value: 'pending-videos', label: 'Video chờ duyệt' },
          { value: 'published-videos', label: 'Video đã đăng' },
          { value: 'support', label: 'Hỗ trợ' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'pending-videos' && <PendingVideosPanel />}
      {tab === 'published-videos' && <PublishedVideosPanel />}
      {tab === 'support' && <SupportTicketsPanel />}
    </section>
  );
}

function SupportTicketsPanel() {
  const [status, setStatus] = useState<
    AdminSupportTicketDto['status'] | undefined
  >('open');
  const tickets = useAdminSupportTickets(status);
  const updateTicket = useUpdateSupportTicket();

  return (
    <div className="space-y-4">
      <Card>
        <Field htmlFor="support-status-filter" label="Trạng thái">
          <select
            id="support-status-filter"
            value={status ?? ''}
            onChange={(event) =>
              setStatus(
                event.target.value === ''
                  ? undefined
                  : (event.target.value as AdminSupportTicketDto['status']),
              )
            }
            className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px]"
          >
            <option value="open">Đã tiếp nhận</option>
            <option value="in_progress">Đang xử lý</option>
            <option value="resolved">Đã giải quyết</option>
            <option value="closed">Đã đóng</option>
            <option value="">Tất cả</option>
          </select>
        </Field>
      </Card>
      {tickets.isPending && <LoadingState />}
      {tickets.error !== null && <ErrorState error={tickets.error} />}
      {updateTicket.error !== null && <ErrorState error={updateTicket.error} />}
      {tickets.data !== undefined && tickets.data.items.length === 0 && (
        <EmptyState title="Không có yêu cầu hỗ trợ nào" />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {tickets.data?.items.map((ticket) => (
          <SupportTicketCard
            key={ticket.id}
            ticket={ticket}
            busy={updateTicket.isPending}
            onUpdate={(nextStatus, staffResponse) =>
              updateTicket.mutate(
                { id: ticket.id, status: nextStatus, staffResponse },
                { onSuccess: () => showToast('Đã cập nhật yêu cầu hỗ trợ') },
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function SupportTicketCard({
  ticket,
  busy,
  onUpdate,
}: {
  ticket: AdminSupportTicketDto;
  busy: boolean;
  onUpdate: (
    status: AdminSupportTicketDto['status'],
    staffResponse?: string,
  ) => void;
}) {
  const [response, setResponse] = useState(ticket.staffResponse ?? '');
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Pill
          variant={
            ticket.status === 'resolved'
              ? 'green'
              : ticket.status === 'closed'
                ? 'neutral'
                : 'gold'
          }
        >
          {ticket.status}
        </Pill>
        <span className="font-mono text-[10px] text-muted-foreground">
          {ticket.userId}
        </span>
      </div>
      <p className="mt-3 text-sm">{ticket.message}</p>
      <textarea
        aria-label={`Phản hồi ticket ${ticket.id}`}
        value={response}
        onChange={(event) => setResponse(event.target.value)}
        placeholder="Phản hồi cho người dùng…"
        className="mt-3 min-h-20 w-full rounded-xl border border-border bg-muted p-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {ticket.status === 'open' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onUpdate('in_progress', response)}
          >
            Nhận xử lý
          </Button>
        )}
        {(ticket.status === 'open' || ticket.status === 'in_progress') && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onUpdate('resolved', response)}
          >
            Đã giải quyết
          </Button>
        )}
        {ticket.status !== 'closed' && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => onUpdate('closed', response)}
          >
            Đóng
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReportsPanel() {
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
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Lý do
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Mô tả
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Target user
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Trạng thái
                  </th>
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

function PendingVideosPanel() {
  const { data, isPending, error } = usePendingVideos();
  const approveVideo = useApproveVideo();
  const rejectVideo = useRejectVideo();

  const busy = approveVideo.isPending || rejectVideo.isPending;

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">
        Video ở chế độ kiểm duyệt trước chỉ xuất hiện công khai sau khi được
        duyệt.
      </p>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có video nào đang chờ duyệt" />
      )}

      {data !== undefined && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {data.items.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                busy={busy}
                onApprove={() =>
                  approveVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã duyệt video'),
                  })
                }
                onReject={() =>
                  rejectVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã từ chối video', 'warn'),
                  })
                }
                mode="pending"
              />
            ))}
          </div>
          {data.nextCursor !== null && (
            <p className="text-xs text-muted-foreground">
              Còn video khác đang chờ — duyệt/từ chối bớt video hiện tại để tải
              danh sách mới.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PublishedVideosPanel() {
  const { data, isPending, error } = usePublishedVideos();
  const removeVideo = useRemoveVideo();

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">
        Video đang hiển thị công khai. Gỡ video sẽ chuyển sang trạng thái
        removed và ghi audit log; thao tác không thể hoàn tác.
      </p>
      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {removeVideo.error !== null && <ErrorState error={removeVideo.error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có video nào đang hiển thị" />
      )}
      {data !== undefined && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {data.items.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                busy={removeVideo.isPending}
                mode="published"
                onRemove={() => {
                  if (!window.confirm('Gỡ video này khỏi feed công khai?'))
                    return;
                  removeVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã gỡ video', 'warn'),
                  });
                }}
              />
            ))}
          </div>
          {data.nextCursor !== null && (
            <p className="text-xs text-muted-foreground">
              Còn video khác — danh sách tiếp theo sẽ được bổ sung bằng nút tải
              thêm.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function VideoCard({
  video,
  busy,
  onApprove,
  onReject,
  onRemove,
  mode,
}: {
  video: AdminVideoDto;
  busy: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
  mode: 'pending' | 'published';
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary">
      <div className="flex h-[120px] items-center justify-center bg-muted text-[11px] font-bold text-muted-foreground">
        {video.thumbnailUrl !== null ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          'Video ngắn'
        )}
      </div>
      <div className="p-3.5">
        <div className="mb-1 truncate font-mono text-[11px] text-muted-foreground">
          {video.authorUserId}
        </div>
        <div className="mb-2.5 line-clamp-2 text-xs text-muted-foreground">
          {video.caption ?? '(không có caption)'}
        </div>
        {mode === 'pending' ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={onApprove}
            >
              Duyệt
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={busy}
              onClick={onReject}
            >
              Từ chối
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="w-full"
            disabled={busy}
            onClick={onRemove}
          >
            Gỡ khỏi feed
          </Button>
        )}
      </div>
    </div>
  );
}
