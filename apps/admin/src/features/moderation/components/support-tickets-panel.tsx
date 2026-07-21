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
import { useAdminSupportTickets, useUpdateSupportTicket } from '../support-api';

import type { AdminSupportTicketDto } from '../support-api';

export function SupportTicketsPanel() {
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
