'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import {
  canPublishRole,
  partyRoomKeys,
  useLeaveRoom,
  useRoomDetail,
} from '../api';
import { usePartyRoomMedia } from '../hooks/use-party-room-media';
import { MemberList } from './member-list';
import { PartyAudio } from './party-audio';

import type {
  PartyMemberJoinedEventData,
  PartyMemberLeftEventData,
  PartyRoleChangedEventData,
  PartyRoomClosedEventData,
} from '@litmatch/common-dtos/pure';

const CLOSE_REASON_LABEL: Record<string, string> = {
  host_left: 'Host đã rời phòng',
  finished: 'Phòng đã kết thúc',
  swept: 'Phòng đã đóng do không còn hoạt động',
  error: 'Phòng gặp lỗi và đã đóng',
};

export function PartyStage({ roomId }: { roomId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const detail = useRoomDetail(roomId);
  const myMembership = detail.data?.members.find(
    (m) => m.userId === me.data?.id,
  );
  const isMember = myMembership !== undefined;
  const canPublish = canPublishRole(myMembership?.role);
  const media = usePartyRoomMedia(roomId, canPublish);
  const leaveRoom = useLeaveRoom(roomId);

  const invalidateDetail = (): void => {
    void queryClient.invalidateQueries({
      queryKey: partyRoomKeys.detail(roomId),
    });
  };

  // Realtime chỉ gợi ý refetch sớm — poll 5s của useRoomDetail vẫn là fallback thật.
  useRealtimeEvent<PartyMemberJoinedEventData>(
    RealtimeEvents.PartyMemberJoined,
    (data) => {
      if (data.roomId === roomId) invalidateDetail();
    },
  );
  useRealtimeEvent<PartyMemberLeftEventData>(
    RealtimeEvents.PartyMemberLeft,
    (data) => {
      if (data.roomId === roomId) invalidateDetail();
    },
  );
  useRealtimeEvent<PartyRoleChangedEventData>(
    RealtimeEvents.PartyRoleChanged,
    (data) => {
      if (data.roomId === roomId) invalidateDetail();
    },
  );
  useRealtimeEvent<PartyRoomClosedEventData>(
    RealtimeEvents.PartyRoomClosed,
    (data) => {
      if (data.roomId === roomId) {
        media.disconnect();
        invalidateDetail();
      }
    },
  );

  // Refresh-safe: REST đã xác nhận mình là member (vd reload trang) thì tự kết nối lại
  // media — nhưng KHÔNG tự join khi chưa từng là member (opt-in, tránh bật mic bất ngờ).
  const { connect, room: mediaRoom, isConnecting } = media;
  useEffect(() => {
    if (isMember && mediaRoom === null && !isConnecting) connect();
  }, [isMember, mediaRoom, isConnecting, connect]);

  if (detail.isPending || me.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  }

  if (detail.isError) {
    const message = isApiError(detail.error)
      ? detail.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (detail.data === undefined) return null;

  const { room } = detail.data;

  if (room.status === 'closed') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {room.closeReason !== null
            ? (CLOSE_REASON_LABEL[room.closeReason] ?? room.closeReason)
            : 'Phòng đã đóng'}
        </p>
        <Link href="/party" className="text-sm text-primary underline">
          Về danh sách phòng
        </Link>
      </div>
    );
  }

  if (!isMember || myMembership === undefined) {
    const message = isApiError(media.error)
      ? media.error.message
      : media.error !== null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined;
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{room.title}</h1>
        <p className="text-sm text-muted-foreground">
          Tối đa {room.speakerLimit} người nói
        </p>
        {message !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <button
          type="button"
          className="h-10 w-full rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={media.isConnecting}
          onClick={media.connect}
        >
          {media.isConnecting ? 'Đang tham gia…' : 'Tham gia phòng'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{room.title}</h1>
      {media.room !== null && <PartyAudio room={media.room} />}
      {media.roomDisconnected && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Mất kết nối phòng thoại.
          </p>
          <button
            type="button"
            className="h-9 rounded-md border border-border px-3 text-sm hover:bg-card"
            onClick={media.connect}
          >
            Kết nối lại
          </button>
        </div>
      )}
      <MemberList
        roomId={roomId}
        members={detail.data.members}
        isHost={myMembership.role === 'host'}
      />
      <button
        type="button"
        className="h-9 rounded-md border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
        disabled={leaveRoom.isPending}
        onClick={() =>
          leaveRoom.mutate(undefined, {
            onSuccess: () => {
              media.disconnect();
              router.push('/party');
            },
          })
        }
      >
        {leaveRoom.isPending ? 'Đang rời…' : 'Rời phòng'}
      </button>
    </div>
  );
}
