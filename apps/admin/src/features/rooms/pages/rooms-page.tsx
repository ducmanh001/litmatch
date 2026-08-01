import { showToast } from '../../../shared/lib/toast-store';
import { t, useT } from '../../../shared/i18n/catalog';
import { Button } from '../../../shared/ui/button';
import { Pill } from '../../../shared/ui/pill';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { useAdminRooms, useCloseRoom } from '../api';

import type { AdminRoomDto } from '../api';

function liveDurationLabel(createdAt: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );
  if (minutes < 60) return t('rooms.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t('rooms.hoursMinutes', { hours, minutes: minutes % 60 });
}

export function RoomsPage() {
  const t = useT();
  const { data, isPending, error } = useAdminRooms();
  const closeRoom = useCloseRoom();

  return (
    <section className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">{t('rooms.hint')}</p>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.length === 0 && (
        <EmptyState title={t('dashboard.noRooms')} />
      )}

      {data !== undefined && data.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
          {data.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              busy={closeRoom.isPending}
              onClose={() => {
                if (
                  !window.confirm(
                    t('rooms.confirmClose', { title: room.title }),
                  )
                )
                  return;
                closeRoom.mutate(room.id, {
                  onSuccess: (result) =>
                    showToast(
                      result?.closed === false
                        ? t('rooms.alreadyClosed')
                        : t('rooms.closed'),
                      result?.closed === false ? 'warn' : undefined,
                    ),
                });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoomCard({
  room,
  busy,
  onClose,
}: {
  room: AdminRoomDto;
  busy: boolean;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold">
          {room.title}
        </div>
        <Pill variant="red">{t('common.live')}</Pill>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>{t('rooms.host')}</span>
        <b className="truncate font-mono font-bold text-foreground">
          {room.hostUserId}
        </b>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>{t('rooms.members')}</span>
        <b className="font-bold text-foreground">{room.memberCount}</b>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>{t('rooms.speakerLimit')}</span>
        <b className="font-bold text-foreground">{room.speakerLimit}</b>
      </div>
      <div className="flex justify-between text-[11.5px] text-muted-foreground">
        <span>{t('rooms.liveFor')}</span>
        <b className="font-bold text-foreground">
          {liveDurationLabel(room.createdAt)}
        </b>
      </div>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={onClose}
      >
        {t('rooms.close')}
      </Button>
    </div>
  );
}
