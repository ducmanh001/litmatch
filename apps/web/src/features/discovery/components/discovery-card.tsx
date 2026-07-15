import { useState } from 'react';

import { placeholderAvatarUrl } from '../../../shared/lib/placeholder-avatar';
import { ProfileIcon } from '../../../shared/ui/icons';

import type { DiscoveryCardDto, NearbyCardDto } from '../api';

/** Card Discovery/Nearby — `PublicProfileDto` chỉ có `avatarId` (không phải URL ảnh), dùng
 * placeholderAvatarUrl (seed = userId) để layout đủ ảnh như mockup thay vì icon trống. */
export function DiscoveryCard({
  card,
  onClick,
}: {
  card: DiscoveryCardDto | NearbyCardDto;
  onClick: () => void;
}) {
  const meta =
    'ageBucket' in card ? (card.ageBucket ?? undefined) : card.distanceBucket;
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-black/5 bg-white text-left dark:border-white/5 dark:bg-surf"
    >
      <div className="flex h-36 items-center justify-center bg-slate-100 dark:bg-surf2">
        {imageFailed ? (
          <ProfileIcon width={40} height={40} className="text-slate-400" />
        ) : (
          <img
            src={placeholderAvatarUrl(card.profile.id)}
            alt=""
            width={200}
            height={144}
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
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
