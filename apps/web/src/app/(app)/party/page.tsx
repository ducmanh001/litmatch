import { RoomList } from '../../../features/party-room/components/room-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Party Room' };

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <div className="px-5">
        <h1 className="font-display text-2xl font-semibold italic">
          Party Room
        </h1>
      </div>
      <div className="px-5">
        <RoomList />
      </div>
    </div>
  );
}
