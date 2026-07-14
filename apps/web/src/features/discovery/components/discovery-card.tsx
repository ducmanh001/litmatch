import { ProfileIcon } from '../../../shared/ui/icons';

import type { DiscoveryCardDto, NearbyCardDto } from '../api';

/** Card Discovery/Nearby — không có ảnh thật (`PublicProfileDto` chỉ có `avatarId`, không có URL
 * ảnh), dùng icon trung lập thay vì bịa ảnh đại diện. */
export function DiscoveryCard({
  card,
  onClick,
}: {
  card: DiscoveryCardDto | NearbyCardDto;
  onClick: () => void;
}) {
  const meta =
    'ageBucket' in card ? (card.ageBucket ?? undefined) : card.distanceBucket;

  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-black/5 bg-white text-left dark:border-white/5 dark:bg-surf"
    >
      <div className="flex h-36 items-center justify-center bg-slate-100 dark:bg-surf2">
        <ProfileIcon width={40} height={40} className="text-slate-400" />
      </div>
      <div className="p-2.5">
        <p className="text-sm font-bold">{card.profile.nickname}</p>
        {meta !== undefined && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {meta}
          </p>
        )}
      </div>
    </button>
  );
}
