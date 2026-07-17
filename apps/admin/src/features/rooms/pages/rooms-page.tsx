import { showToast } from '../../../shared/lib/toast-store';
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
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

export function RoomsPage() {
  const { data, isPending, error } = useAdminRooms();
  const closeRoom = useCloseRoom();

  return (
    <section className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">
        Số thành viên lấy từ membership active. Kết thúc phòng sẽ đóng phiên,
        ngắt SFU và ghi audit log; thao tác không thể hoàn tác.
      </p>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.length === 0 && (
        <EmptyState title="Không có phòng nào đang hoạt động" />
      )}

      {data !== undefined && data.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
          {data.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              busy={closeRoom.isPending}
              onClose={() => {
                if (!window.confirm(`Kết thúc phòng “${room.title}”?`)) return;
                closeRoom.mutate(room.id, {
                  onSuccess: (result) =>
                    showToast(
                      result?.closed === false
                        ? 'Phòng đã được kết thúc trước đó'
                        : 'Đã kết thúc phòng',
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
  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold">
          {room.title}
        </div>
        <Pill variant="red">LIVE</Pill>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>Host</span>
        <b className="truncate font-mono font-bold text-foreground">
          {room.hostUserId}
        </b>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>Thành viên đang ở phòng</span>
        <b className="font-bold text-foreground">{room.memberCount}</b>
      </div>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>Giới hạn người nói</span>
        <b className="font-bold text-foreground">{room.speakerLimit}</b>
      </div>
      <div className="flex justify-between text-[11.5px] text-muted-foreground">
        <span>Đã live</span>
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
        Kết thúc phòng
      </Button>
    </div>
  );
}
