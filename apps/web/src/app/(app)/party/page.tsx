import { RoomList } from '../../../features/party-room/components/room-list';
import { PartyIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Party Room' };

export default function PartyPage() {
  return (
    <div>
      <div className="px-5">
        <PageHeader
          eyebrow="Trò chuyện nhóm"
          eyebrowIcon={<PartyIcon width={16} height={16} />}
        />
      </div>
      <div className="px-5">
        <RoomList />
      </div>
    </div>
  );
}
