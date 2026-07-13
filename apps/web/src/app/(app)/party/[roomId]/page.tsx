import { PartyStage } from '../../../../features/party-room/components/party-stage';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Phòng nhóm' };

export default async function PartyRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return (
    <section className="mx-auto max-w-md space-y-4">
      <PartyStage roomId={roomId} />
    </section>
  );
}
