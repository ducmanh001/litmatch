import { useState } from 'react';

import { placeholderAvatarUrl } from '../../../shared/lib/placeholder-avatar';
import { ProfileIcon } from '../../../shared/ui/icons';

import type { DiscoveryCardDto, NearbyCardDto } from '../api';

function cardMeta(card: DiscoveryCardDto | NearbyCardDto): string | undefined {
  if ('ageBucket' in card) {
    return card.ageBucket === null ? undefined : `${card.ageBucket} tuổi`;
  }
  return `Trong khoảng ${card.distanceBucket}`;
}

/** Card dùng đúng dữ liệu public mà Discovery/Nearby trả về: ảnh đại diện, nickname và
 * age/distance bucket. Không suy đoán trạng thái online, ý định hẹn hò hay vị trí chính xác. */
export function DiscoveryCard({
  card,
  onClick,
}: {
  card: DiscoveryCardDto | NearbyCardDto;
  onClick: () => void;
}) {
  const meta = cardMeta(card);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Xem hồ sơ ${card.profile.nickname}${meta === undefined ? '' : `, ${meta}`}`}
      className="group relative aspect-[4/5] min-h-52 w-full overflow-hidden rounded-[1.4rem] border border-border bg-muted text-left shadow-sm shadow-black/5 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-white/10 dark:bg-surf2 dark:shadow-none dark:hover:border-rose-300/30 dark:hover:shadow-none"
    >
      {imageFailed ? (
        <span className="absolute inset-0 flex items-center justify-center bg-muted dark:bg-surf2">
          <ProfileIcon
            width={48}
            height={48}
            className="text-muted-foreground dark:text-white/50"
          />
        </span>
      ) : (
        <img
          src={placeholderAvatarUrl(card.profile.id)}
          alt=""
          width={360}
          height={450}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"
        />
      )}

      <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

      {meta !== undefined && (
        <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md dark:bg-surf/75">
          {meta}
        </span>
      )}

      <span className="absolute inset-x-0 bottom-0 p-3.5 text-white md:p-4">
        <span className="block truncate text-base font-extrabold md:text-lg">
          {card.profile.nickname}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold text-white/85 md:text-xs">
          Xem hồ sơ và chọn cách mở lời
        </span>
      </span>
    </button>
  );
}
