import { RoomList } from '../../../features/party-room/components/room-list';
import { DiscoveryIcon } from '../../../shared/ui/icons';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Phòng nhóm' };

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-5">
        <h1 className="font-display text-2xl font-semibold italic">
          Phòng nhóm
        </h1>
        {/* Tìm kiếm phòng: chưa có state/query tìm kiếm nào ở tầng data — nút hiện tại chỉ để
            khớp layout mockup, chưa có hành vi (docs/13: không fabricate logic không có thật). */}
        <button
          type="button"
          disabled
          aria-label="Tìm kiếm phòng (sắp có)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 opacity-60 dark:bg-surf2"
        >
          <DiscoveryIcon width={16} height={16} />
        </button>
      </div>
      <RoomList />
    </div>
  );
}
