import { RoomList } from '../../../features/party-room/components/room-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Phòng nhóm' };

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <h1 className="font-display px-5 text-2xl font-semibold italic">
        Phòng nhóm
      </h1>
      <RoomList />
    </div>
  );
}
