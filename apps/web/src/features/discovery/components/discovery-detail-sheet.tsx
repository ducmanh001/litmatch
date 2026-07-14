import { ProfileIcon } from '../../../shared/ui/icons';

import type { DiscoveryCardDto, NearbyCardDto } from '../api';

/** Sheet chi tiết 1 user — invite CTA điều khiển bởi route cha (route được phép import
 * `features/matching`, feature `discovery` thì không — docs/13 § 13.3 boundary). */
export function DiscoveryDetailSheet({
  card,
  onClose,
  onInvite,
  inviteId,
  isInviting,
  inviteError,
  invitedMatchType,
}: {
  card: DiscoveryCardDto | NearbyCardDto;
  onClose: () => void;
  onInvite: (matchType: 'soul' | 'voice') => void;
  inviteId: string | undefined;
  isInviting: boolean;
  inviteError: string | undefined;
  invitedMatchType: 'soul' | 'voice' | undefined;
}) {
  const meta =
    'ageBucket' in card ? (card.ageBucket ?? undefined) : card.distanceBucket;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[430px] rounded-t-3xl bg-white p-6 pb-8 dark:bg-surf">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        <div className="mb-4 flex items-center gap-4">
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-surf2">
            <ProfileIcon width={36} height={36} className="text-slate-400" />
          </span>
          <div>
            <p className="text-lg font-bold">{card.profile.nickname}</p>
            {meta !== undefined && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {meta}
              </p>
            )}
          </div>
        </div>

        {inviteError !== undefined && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {inviteError}
          </p>
        )}

        {invitedMatchType !== undefined && inviteId !== undefined ? (
          <p className="text-center text-sm font-semibold text-irisl">
            Đã gửi lời mời{' '}
            {invitedMatchType === 'soul' ? 'Soul Match' : 'Voice Match'} — chờ
            phản hồi.
          </p>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isInviting}
              onClick={() => onInvite('soul')}
              className="flex-1 rounded-full bg-gradient-to-br from-irisl to-irisl py-3.5 font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50"
            >
              Mời Soul Match
            </button>
            <button
              type="button"
              disabled={isInviting}
              onClick={() => onInvite('voice')}
              className="flex-1 rounded-full border border-black/10 py-3.5 font-bold disabled:opacity-50 dark:border-white/10"
            >
              Mời Voice Match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
