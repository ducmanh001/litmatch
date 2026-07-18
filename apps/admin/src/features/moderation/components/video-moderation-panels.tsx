import { showToast } from '../../../shared/lib/toast-store';
import { Button } from '../../../shared/ui/button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import {
  useApproveVideo,
  usePendingVideos,
  usePublishedVideos,
  useRejectVideo,
  useRemoveVideo,
} from '../videos-api';

import type { AdminVideoDto } from '../videos-api';

export function PendingVideosPanel() {
  const { data, isPending, error } = usePendingVideos();
  const approveVideo = useApproveVideo();
  const rejectVideo = useRejectVideo();
  const busy = approveVideo.isPending || rejectVideo.isPending;

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">
        Video ở chế độ kiểm duyệt trước chỉ xuất hiện công khai sau khi được
        duyệt.
      </p>
      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có video nào đang chờ duyệt" />
      )}
      {data !== undefined && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {data.items.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                busy={busy}
                onApprove={() =>
                  approveVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã duyệt video'),
                  })
                }
                onReject={() =>
                  rejectVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã từ chối video', 'warn'),
                  })
                }
                mode="pending"
              />
            ))}
          </div>
          {data.nextCursor !== null && (
            <p className="text-xs text-muted-foreground">
              Còn video khác đang chờ — duyệt/từ chối bớt video hiện tại để tải
              danh sách mới.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function PublishedVideosPanel() {
  const { data, isPending, error } = usePublishedVideos();
  const removeVideo = useRemoveVideo();

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-muted-foreground">
        Video đang hiển thị công khai. Gỡ video sẽ chuyển sang trạng thái
        removed và ghi audit log; thao tác không thể hoàn tác.
      </p>
      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {removeVideo.error !== null && <ErrorState error={removeVideo.error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có video nào đang hiển thị" />
      )}
      {data !== undefined && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {data.items.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                busy={removeVideo.isPending}
                mode="published"
                onRemove={() => {
                  if (!window.confirm('Gỡ video này khỏi feed công khai?'))
                    return;
                  removeVideo.mutate(video.id, {
                    onSuccess: () => showToast('Đã gỡ video', 'warn'),
                  });
                }}
              />
            ))}
          </div>
          {data.nextCursor !== null && (
            <p className="text-xs text-muted-foreground">
              Còn video khác — danh sách tiếp theo sẽ được bổ sung bằng nút tải
              thêm.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function VideoCard({
  video,
  busy,
  onApprove,
  onReject,
  onRemove,
  mode,
}: {
  video: AdminVideoDto;
  busy: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
  mode: 'pending' | 'published';
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary">
      <div className="flex h-[120px] items-center justify-center bg-muted text-[11px] font-bold text-muted-foreground">
        {video.thumbnailUrl !== null ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          'Video ngắn'
        )}
      </div>
      <div className="p-3.5">
        <div className="mb-1 truncate font-mono text-[11px] text-muted-foreground">
          {video.authorUserId}
        </div>
        <div className="mb-2.5 line-clamp-2 text-xs text-muted-foreground">
          {video.caption ?? '(không có caption)'}
        </div>
        {mode === 'pending' ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={onApprove}
            >
              Duyệt
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={busy}
              onClick={onReject}
            >
              Từ chối
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="w-full"
            disabled={busy}
            onClick={onRemove}
          >
            Gỡ khỏi feed
          </Button>
        )}
      </div>
    </div>
  );
}
