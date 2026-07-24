'use client';

import { isApiError } from '@litmatch/api-client';
import { useRouter } from 'next/navigation';

import { Button } from '../../../shared/ui/button';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import {
  useAcceptInvite,
  useDeclineInvite,
  useReceivedInvites,
} from '../invite-api';

function errorMessage(error: unknown): string | undefined {
  if (isApiError(error)) return error.message;
  if (error !== null && error !== undefined) {
    return 'Có lỗi xảy ra, vui lòng thử lại.';
  }
  return undefined;
}

function expiryLabel(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return 'Có thời hạn';
  return `Hết hạn lúc ${expiry.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function IncomingInvites() {
  const router = useRouter();
  const invitesQuery = useReceivedInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const invites = invitesQuery.data?.items ?? [];
  const actionError =
    errorMessage(acceptInvite.error) ?? errorMessage(declineInvite.error);

  return (
    <section
      className="rounded-[1.75rem] border border-border bg-card p-5 dark:border-white/10 dark:bg-surf"
      aria-labelledby="incoming-invites-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/80">
            Kết nối trực tiếp
          </p>
          <h2
            id="incoming-invites-title"
            className="mt-1 text-sm font-extrabold dark:text-white"
          >
            Lời mời dành cho bạn
          </h2>
        </div>
        {invites.length > 0 && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-irisl px-2 text-xs font-extrabold text-white">
            {invites.length}
          </span>
        )}
      </div>

      {invitesQuery.isPending ? (
        <div
          className="mt-4 space-y-2"
          role="status"
          aria-label="Đang tải lời mời"
        >
          <div className="h-16 animate-pulse rounded-2xl bg-muted dark:bg-surf2/70" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted dark:bg-surf2/70" />
        </div>
      ) : invitesQuery.isError ? (
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3">
          <p role="alert" className="text-xs leading-5 text-destructive">
            {errorMessage(invitesQuery.error)}
          </p>
          <button
            type="button"
            onClick={() => void invitesQuery.refetch()}
            className="mt-2 text-xs font-extrabold text-destructive underline underline-offset-2"
          >
            Thử lại
          </button>
        </div>
      ) : invites.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-muted/70 p-4 text-center dark:border dark:border-white/10 dark:bg-surf2/55">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-white/[0.05] dark:text-white">
            <MatchIcon width={18} height={18} />
          </div>
          <p className="mt-3 text-xs font-bold dark:text-white">
            Chưa có lời mời mới
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground dark:text-white/70">
            Khi ai đó mời bạn Soul hoặc Voice, bạn sẽ chủ động quyết định có
            tham gia hay không.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {invites.map((invite) => {
            const isSoul = invite.matchType === 'soul';
            const InviteIcon = isSoul ? MatchIcon : MicIcon;
            return (
              <article
                key={invite.id}
                className="rounded-2xl border border-border bg-background p-3 dark:border-white/10 dark:bg-surf2/55"
              >
                <div className="flex items-start gap-3">
                  <span className="relative shrink-0">
                    <PlaceholderAvatar
                      seed={invite.inviterProfile.avatarId}
                      alt={invite.inviterProfile.nickname}
                      size={42}
                      className="ring-1 ring-iris/20 dark:ring-white/15"
                    />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-background bg-irisl text-white">
                      <InviteIcon width={10} height={10} />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold dark:text-white">
                      {invite.inviterProfile.nickname}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-white/70">
                      Mời bạn{' '}
                      {isSoul ? 'trò chuyện Tâm hồn' : 'bắt đầu Voice Match'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground dark:text-white/60">
                      {expiryLabel(invite.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={acceptInvite.isPending || declineInvite.isPending}
                    onClick={() => declineInvite.mutate(invite.id)}
                  >
                    {declineInvite.isPending ? 'Đang từ chối…' : 'Từ chối'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-irisl text-white shadow-none hover:bg-irisl/90"
                    disabled={acceptInvite.isPending || declineInvite.isPending}
                    onClick={() =>
                      acceptInvite.mutate(invite.id, {
                        onSuccess: (data) => {
                          if (data === undefined) return;
                          router.replace(
                            invite.matchType === 'soul'
                              ? `/matching/soul/${data.sessionId}`
                              : `/matching/voice/${data.sessionId}`,
                          );
                        },
                      })
                    }
                  >
                    {acceptInvite.isPending ? 'Đang vào…' : 'Chấp nhận'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {actionError !== undefined && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
        >
          {actionError}
        </p>
      )}
    </section>
  );
}
