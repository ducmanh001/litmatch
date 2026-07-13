import { RoomList } from '../../../features/party-room/components/room-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Phòng nhóm' };

export default function PartyPage() {
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Phòng nhóm</h1>
      <RoomList />
    </section>
  );
}
