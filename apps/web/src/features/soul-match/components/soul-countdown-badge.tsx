'use client';

import { useEffect, useState } from 'react';

import { formatMinutesSeconds } from '../../../shared/lib/format-minutes-seconds';
import { useSoulSession } from '../api';

/** Badge đếm ngược của top bar (soul-match.html `#timerBadge`) — dùng thật `chatEndsAt`/
 * `ratingEndsAt` từ SoulSessionViewDto, không tự bịa deadline. Ẩn (chỉ giữ chỗ) khi phase
 * đã đóng hoặc chưa có dữ liệu. */
export function SoulCountdownBadge({ sessionId }: { sessionId: string }) {
  const session = useSoulSession(sessionId);
  const [now, setNow] = useState(() => Date.now());

  const s = session.data;
  const deadline =
    s?.phase === 'chatting'
      ? s.chatEndsAt
      : s?.phase === 'rating'
        ? s.ratingEndsAt
        : null;

  useEffect(() => {
    if (deadline === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (deadline === null) {
    return <div data-testid="countdown-spacer" className="h-9 w-9" />;
  }

  const remainingMs = new Date(deadline).getTime() - now;

  return (
    <span className="rounded-full bg-iris/15 px-3 py-1.5 text-xs font-extrabold text-irisl">
      {formatMinutesSeconds(remainingMs / 1000)}
    </span>
  );
}
