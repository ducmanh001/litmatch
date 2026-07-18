'use client';

import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';

import type { TicketDto } from '../api';

/** Radar thuần hiển thị: các avatar là marker ẩn danh, không phải danh tính/vị trí thật của
 * ứng viên. Việc chọn cặp vẫn do server quyết định từ queue. */
export function MatchingScanner({
  matchType,
}: {
  matchType: TicketDto['matchType'];
}) {
  const MatchTypeIcon = matchType === 'soul' ? MatchIcon : MicIcon;
  const avatarSlides = [
    'scan-amber',
    'scan-violet',
    'scan-sky',
    'scan-rose',
    'scan-lime',
  ];

  return (
    <div aria-hidden className="relative h-52 w-64 overflow-hidden">
      <span
        className="absolute left-1/2 h-40 w-40 -translate-x-1/2 rounded-full border border-iris/10 bg-gradient-to-br from-iris/[0.08] to-transparent"
        style={{ top: '-1rem' }}
      />
      <span className="pulsering absolute left-1/2 h-32 w-32 -translate-x-1/2 rounded-full border border-iris/35" />
      <span className="pulsering2 absolute left-1/2 h-32 w-32 -translate-x-1/2 rounded-full border border-iris/35" />
      <span className="absolute left-1/2 top-2 h-28 w-28 -translate-x-1/2 rounded-full border border-dashed border-iris/25" />

      <span className="absolute left-1/2 top-4 z-10 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-[2rem] bg-irisl text-white shadow-xl shadow-iris/25">
        <MatchTypeIcon width={34} height={34} />
      </span>

      <div className="absolute bottom-0 flex w-full overflow-hidden px-4">
        <div className="matching-avatar-track flex min-w-max gap-3 motion-reduce:animate-none">
          {[...avatarSlides, ...avatarSlides].map((seed, index) => (
            <span
              key={`${seed}-${index}`}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aqua via-iris to-irisl p-0.5 shadow-lg shadow-iris/25"
            >
              <PlaceholderAvatar
                seed={seed}
                size={48}
                className="border-2 border-card dark:border-surf"
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
