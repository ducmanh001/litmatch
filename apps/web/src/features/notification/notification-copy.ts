import type { NotificationDto } from './api';

export type NotificationPresentation = {
  title: string;
  body: string | null;
  /** Route nội bộ để điều hướng khi bấm; null = chỉ đọc (vd. broadcast). */
  href: string | null;
};

/** Payload server là JSON tự do theo từng type — đọc phòng thủ, thiếu field thì bỏ link/body. */
function readString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Diễn giải notification cho panel chuông (copy + đích điều hướng). Chỉ diễn giải type server
 * đã khai trong NotificationDto; type lạ (client cũ gặp server mới) rơi về bản tin chung
 * không link — không được ném lỗi làm vỡ cả panel.
 */
export function presentNotification(
  notification: Pick<NotificationDto, 'type' | 'payload'>,
): NotificationPresentation {
  const payload = (notification.payload ?? {}) as Record<string, unknown>;

  switch (notification.type) {
    case 'match_confirmed':
      return {
        title: 'Ghép đôi thành công',
        body: 'Hai bạn đã đồng ý kết nối — cuộc trò chuyện đang chờ.',
        href: '/matching',
      };
    case 'friend_message': {
      const senderUserId = readString(payload, 'senderUserId');
      return {
        title: 'Tin nhắn mới',
        body: readString(payload, 'preview'),
        href: senderUserId ? `/chat/${senderUserId}` : '/friends',
      };
    }
    case 'gift_received': {
      const roomId = readString(payload, 'roomId');
      const videoId = readString(payload, 'videoId');
      return {
        title: 'Bạn vừa nhận được quà',
        body: readString(payload, 'giftCode'),
        // Context phòng → vào phòng; context video → mở reel; còn lại xem ví
        href: roomId ? `/party/${roomId}` : videoId ? '/video' : '/wallet',
      };
    }
    case 'post_liked': {
      const postId = readString(payload, 'postId');
      return {
        title: 'Có người thích bài viết của bạn',
        body: null,
        href: postId ? `/feed/${postId}` : '/feed',
      };
    }
    case 'post_commented': {
      const postId = readString(payload, 'postId');
      return {
        title: 'Bình luận mới trên bài viết của bạn',
        body: null,
        href: postId ? `/feed/${postId}` : '/feed',
      };
    }
    case 'streak_milestone':
      return {
        title: 'Chuỗi trò chuyện đạt mốc mới 🔥',
        body: 'Tiếp tục giữ nhịp trò chuyện mỗi ngày nhé.',
        href: '/friends',
      };
    case 'streak_at_risk':
      return {
        title: 'Chuỗi trò chuyện sắp bị mất',
        body: 'Nhắn một câu hôm nay để giữ chuỗi 🔥.',
        href: '/friends',
      };
    case 'match_invite_received':
      return {
        title: 'Bạn nhận được lời mời ghép đôi',
        body: 'Vào Ghép đôi để trả lời lời mời.',
        href: '/matching',
      };
    case 'admin_broadcast':
      return {
        title: readString(payload, 'title') ?? 'Thông báo từ Litmatch',
        body: readString(payload, 'body'),
        href: null,
      };
    default:
      return { title: 'Thông báo mới', body: null, href: null };
  }
}
