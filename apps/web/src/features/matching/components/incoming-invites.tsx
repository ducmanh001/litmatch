'use client';

import { isApiError } from '@litmatch/api-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '../../../shared/ui/button';
import { useConfirmTicket } from '../api';
import {
  useAcceptInvite,
  useDeclineInvite,
  useReceivedInvites,
} from '../invite-api';

/** Sau accept: ticket đã ở 'matched' cho ĐÚNG người gọi — phải confirmTicket tiếp như auto-match
 * (docs/services/matching-service.md § 9.2) rồi mới điều hướng vào phòng. */
function useAcceptAndEnter() {
  const router = useRouter();
  const [pending, setPending] = useState<{
    ticketId: string;
    sessionId: string;
    matchType: 'soul' | 'voice';
  } | null>(null);
  const confirmTicket = useConfirmTicket(pending?.ticketId ?? '');

  useEffect(() => {
    if (pending === null) return;
    confirmTicket.mutate(undefined, {
      onSuccess: () => {
        router.replace(
          pending.matchType === 'soul'
            ? `/matching/soul/${pending.sessionId}`
            : `/matching/voice/${pending.sessionId}`,
        );
      },
      // Không được để `isEntering` kẹt mãi nếu confirm lỗi (vd ticket hết hạn giữa lúc chờ) —
      // trả nút "Chấp nhận" lại trạng thái bấm được, lỗi hiện qua confirmTicket.error.
      onError: () => setPending(null),
    });
    // Chỉ chạy lại khi đổi sang lời mời khác — không phụ thuộc confirmTicket (mutate object đổi
    // identity mỗi render, sẽ tạo vòng lặp gọi lại nếu đưa vào dependency).
  }, [pending]);

  return {
    startEntering: setPending,
    isEntering: pending !== null,
    confirmError: confirmTicket.error,
  };
}

export function IncomingInvites() {
  const invitesQuery = useReceivedInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const { startEntering, isEntering, confirmError } = useAcceptAndEnter();

  const invites = invitesQuery.data?.items ?? [];
  if (invitesQuery.isPending || invites.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <h2 className="text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
        LỜI MỜI ĐANG CHỜ
      </h2>
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf"
        >
          <p className="text-sm">
            Ai đó mời bạn{' '}
            <span className="font-bold">
              {invite.matchType === 'soul' ? 'Soul Match' : 'Voice Match'}
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isEntering || declineInvite.isPending}
              onClick={() => declineInvite.mutate(invite.id)}
            >
              Từ chối
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isEntering || acceptInvite.isPending}
              onClick={() =>
                acceptInvite.mutate(invite.id, {
                  onSuccess: (data) => {
                    if (data === undefined) return;
                    startEntering({
                      ticketId: data.inviteeTicketId,
                      sessionId: data.sessionId,
                      matchType: invite.matchType,
                    });
                  },
                })
              }
            >
              {isEntering ? 'Đang vào…' : 'Chấp nhận'}
            </Button>
          </div>
          {isApiError(acceptInvite.error) && (
            <p role="alert" className="text-sm text-destructive">
              {acceptInvite.error.message}
            </p>
          )}
          {isApiError(confirmError) && (
            <p role="alert" className="text-sm text-destructive">
              {confirmError.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
