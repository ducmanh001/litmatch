'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { MicIcon } from '../../../shared/ui/icons';
import {
  canPublishRole,
  partyRoomKeys,
  useGiftCatalog,
  useLeaveRoom,
  useRoomDetail,
} from '../api';
import { usePartyRoomMedia } from '../hooks/use-party-room-media';
import { GiftIcon, GiftPanel } from './gift-panel';
import { MemberList } from './member-list';
import { PartyAudio } from './party-audio';

import type {
  GiftSentEventData,
  PartyHostDisconnectedEventData,
  PartyHostReconnectedEventData,
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
  const giftCatalog = useGiftCatalog();
  const [isGiftPanelOpen, setIsGiftPanelOpen] = useState(false);
  const [lastGift, setLastGift] = useState<GiftSentEventData | null>(null);
  // Mute/unmute mic thủ công của chính mình — CHỈ khả dụng khi role cho publish (host/speaker).
  // Đây là state UI thuần (bật/tắt track cục bộ qua LiveKit thật), không phải quyền publish
  // (canPublish) vốn do use-party-room-media.ts tự set theo role và không đổi ở đây.
  const [micOn, setMicOn] = useState(true);
  const mediaErrorMessage = isApiError(media.error)
    ? media.error.message
    : media.error !== null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

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
  useRealtimeEvent<PartyHostDisconnectedEventData>(
    RealtimeEvents.PartyHostDisconnected,
    (data) => {
      if (data.roomId === roomId) invalidateDetail();
    },
  );
  useRealtimeEvent<PartyHostReconnectedEventData>(
    RealtimeEvents.PartyHostReconnected,
    (data) => {
      if (data.roomId === roomId) invalidateDetail();
    },
  );
  useRealtimeEvent<GiftSentEventData>(RealtimeEvents.GiftSent, (data) => {
    if (data.roomId === roomId) setLastGift(data);
  });

  // Refresh-safe: REST đã xác nhận mình là member (vd reload trang) thì tự kết nối lại
  // media — nhưng KHÔNG tự join khi chưa từng là member (opt-in, tránh bật mic bất ngờ).
  // Chỉ tự thử ĐÚNG 1 LẦN (autoConnectAttempted) cho vòng đời component — không dựa vào
  // isConnecting/mediaError để quyết định retry, vì cả hai đều có khoảng hở bất đồng bộ so
  // với thời điểm LiveKit room.connect() thật sự xong: join REST xong (thành công hay lỗi)
  // luôn nhanh hơn round-trip LiveKit, nên effect có thể thấy "chưa kết nối, không lỗi,
  // không pending" và gọi lại connect() nhiều lần trước khi biết kết quả thật — nếu request
  // đó bắt đầu bị rate-limit thì lặp vô hạn không backoff (bug thật đã bắt được: 1636 request
  // join trong ~6 giây). Mọi lần thử lại SAU lần đầu là thao tác thủ công qua nút "Kết nối lại".
  const autoConnectAttempted = useRef(false);
  const { connect, room: mediaRoom } = media;
  useEffect(() => {
    if (isMember && mediaRoom === null && !autoConnectAttempted.current) {
      autoConnectAttempted.current = true;
      connect();
    }
  }, [isMember, mediaRoom, connect]);

  // Mỗi lần (re)kết nối media hoặc vừa được cấp quyền publish, mic mặc định bật lại — khớp với
  // effect [room, canPublish] ở use-party-room-media.ts (nó tự setMicrophoneEnabled(canPublish)
  // đúng lúc này). Mọi lần bấm nút mic SAU đó chỉ đổi state cục bộ, không bị effect này ghi đè
  // vì mediaRoom/canPublish không đổi khi user tự bấm.
  useEffect(() => {
    if (canPublish) setMicOn(true);
  }, [canPublish, mediaRoom]);

  const toggleMic = (): void => {
    if (media.room === null) return;
    const next = !micOn;
    media.room.localParticipant
      .setMicrophoneEnabled(next)
      .then(() => {
        setMicOn(next);
        // layouts/web/party-room.html: lmToast(micOn ? 'Đã bật mic' : 'Đã tắt mic') — pure client
        // UI state, mute/unmute track cục bộ thật qua LiveKit, không phải quyền publish.
        showToast(next ? 'Đã bật mic' : 'Đã tắt mic');
      })
      .catch(() => {
        showToast('Không thể đổi trạng thái mic, thử lại.', 'warn');
      });
  };

  const handleLeaveRoom = (): void => {
    const isHost = myMembership?.role === 'host';
    const listenerCount = detail.data?.members.length ?? 0;
    void confirmAction({
      title: 'Rời phòng?',
      message: isHost
        ? `Bạn là chủ phòng — rời đi sẽ đóng phòng cho tất cả ${listenerCount} người đang nghe.`
        : 'Bạn có chắc muốn rời phòng này?',
      actionLabel: isHost ? 'Đóng phòng & rời đi' : 'Rời phòng',
      tone: isHost ? 'danger' : 'default',
    }).then((confirmed) => {
      if (!confirmed) return;
      leaveRoom.mutate(undefined, {
        onSuccess: () => {
          media.disconnect();
          router.push('/party');
        },
      });
    });
  };

  if (detail.isPending || me.isPending) {
    return (
      <p className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải…
      </p>
    );
  }

  if (detail.isError) {
    const message = isApiError(detail.error)
      ? detail.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p
        role="alert"
        className="px-5 py-16 text-center text-sm text-destructive"
      >
        {message}
      </p>
    );
  }

  if (detail.data === undefined) return null;

  const { room } = detail.data;

  const describeGiftParty = (userId: string): string => {
    if (userId === me.data?.id) return 'Bạn';
    if (userId === room.hostUserId) return 'host';
    return 'một người nghe';
  };
  const giftName =
    lastGift !== null
      ? (giftCatalog.data?.find((g) => g.code === lastGift.giftCode)?.name ??
        lastGift.giftCode)
      : null;
  const lastGiftLabel =
    lastGift !== null && giftName !== null
      ? `🎁 ${describeGiftParty(lastGift.senderUserId)} đã tặng ${describeGiftParty(lastGift.receiverUserId)} 1 ${giftName}`
      : null;

  if (room.status === 'closed') {
    return (
      <div className="space-y-3 px-5 py-16 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {room.closeReason !== null
            ? (CLOSE_REASON_LABEL[room.closeReason] ?? room.closeReason)
            : 'Phòng đã đóng'}
        </p>
        <Link href="/party" className="text-sm font-bold text-irisl underline">
          Về danh sách phòng
        </Link>
      </div>
    );
  }

  if (!isMember || myMembership === undefined) {
    return (
      <div className="space-y-4 px-5 pb-6 pt-8 text-center">
        <h1 className="font-display text-2xl font-semibold italic">
          {room.title}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tối đa {room.speakerLimit} người nói
        </p>
        {mediaErrorMessage !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {mediaErrorMessage}
          </p>
        )}
        <button
          type="button"
          className="w-full rounded-full bg-gradient-to-br from-irisl to-irisl py-3 font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50"
          disabled={media.isConnecting}
          onClick={media.connect}
        >
          {media.isConnecting ? 'Đang tham gia…' : 'Tham gia phòng'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between px-5 pt-6">
        <div>
          <p className="text-sm font-bold">{room.title}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {detail.data.members.length} người đang nghe
          </p>
        </div>
        <button
          type="button"
          className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold disabled:opacity-50 dark:bg-surf2"
          disabled={leaveRoom.isPending}
          onClick={handleLeaveRoom}
        >
          {leaveRoom.isPending ? 'Đang rời…' : 'Rời phòng'}
        </button>
      </div>

      {room.hostDisconnectedAt !== null && (
        <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
          Host đang mất kết nối — phòng sẽ tự đóng nếu host không quay lại kịp.
        </p>
      )}

      {media.room !== null && <PartyAudio room={media.room} />}

      {(media.roomDisconnected || mediaErrorMessage !== undefined) && (
        <div className="space-y-2 px-5">
          <p role="alert" className="text-sm text-destructive">
            {media.roomDisconnected
              ? 'Mất kết nối phòng thoại.'
              : mediaErrorMessage}
          </p>
          <button
            type="button"
            className="h-9 rounded-full border border-black/10 px-4 text-sm font-bold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
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
        speakerLimit={room.speakerLimit}
      />

      {/* Chưa có kênh chat realtime nào cho Party Room (chỉ có party.member.*,
          party.role.changed, party.room.closed, party.host.* và gift.sent — không có event
          tin nhắn) — không dựng UI chat giả không có transport thật, cần quyết định sản phẩm/
          backend trước. Thông báo quà tặng dưới đây dùng đúng event gift.sent có thật. */}
      {lastGiftLabel !== null && (
        <p className="mx-5 inline-block rounded-lg bg-diamond/10 px-2 py-1 text-xs text-sky-700 dark:text-diamond">
          {lastGiftLabel}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-black/5 px-5 pt-4 dark:border-white/5">
        {canPublish ? (
          // Mute/unmute mic thủ công của chính mình — track cục bộ thật qua LiveKit
          // (media.room.localParticipant), không phải quyền publish (canPublish/role) vốn do
          // use-party-room-media.ts tự quản lý riêng.
          <button
            type="button"
            aria-pressed={micOn}
            aria-label={micOn ? 'Tắt mic' : 'Bật mic'}
            disabled={media.room === null}
            onClick={toggleMic}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
              micOn
                ? 'bg-gradient-to-br from-irisl to-irisl text-white'
                : 'bg-slate-100 text-slate-400 dark:bg-surf2 dark:text-slate-500'
            }`}
          >
            <MicIcon width={18} height={18} />
          </button>
        ) : (
          <span
            role="status"
            aria-label="Bạn đang là khán giả — không bật mic được"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-surf2 dark:text-slate-500"
          >
            <MicIcon width={18} height={18} />
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          aria-expanded={isGiftPanelOpen}
          aria-label={isGiftPanelOpen ? 'Đóng bảng quà tặng' : 'Tặng quà'}
          onClick={() => setIsGiftPanelOpen((open) => !open)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl text-white"
        >
          <GiftIcon width={18} height={18} />
        </button>
      </div>

      {isGiftPanelOpen && (
        <div className="px-5">
          <GiftPanel
            roomId={roomId}
            receiverUserId={room.hostUserId}
            onSent={() => setIsGiftPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
