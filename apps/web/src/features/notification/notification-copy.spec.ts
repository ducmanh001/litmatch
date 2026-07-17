import { presentNotification } from './notification-copy';

import type { NotificationDto } from './api';

function make(type: NotificationDto['type'], payload: Record<string, unknown>) {
  return { type, payload: payload as NotificationDto['payload'] };
}

describe('presentNotification', () => {
  it('friend_message có senderUserId → link thẳng vào hội thoại + preview', () => {
    const result = presentNotification(
      make('friend_message', { senderUserId: 'u-2', preview: 'Chào bạn' }),
    );
    expect(result.href).toBe('/chat/u-2');
    expect(result.body).toBe('Chào bạn');
  });

  it('friend_message thiếu senderUserId → rơi về danh sách tin nhắn', () => {
    const result = presentNotification(make('friend_message', {}));
    expect(result.href).toBe('/friends');
  });

  it('post_liked/post_commented link tới chi tiết bài viết', () => {
    expect(
      presentNotification(make('post_liked', { postId: 'p-1' })).href,
    ).toBe('/feed/p-1');
    expect(
      presentNotification(make('post_commented', { postId: 'p-1' })).href,
    ).toBe('/feed/p-1');
  });

  it('gift_received: phòng → link phòng; video → /video; còn lại → ví', () => {
    expect(
      presentNotification(make('gift_received', { roomId: 'r-1' })).href,
    ).toBe('/party/r-1');
    expect(
      presentNotification(make('gift_received', { videoId: 'v-1' })).href,
    ).toBe('/video');
    expect(presentNotification(make('gift_received', {})).href).toBe('/wallet');
  });

  it('admin_broadcast dùng title/body từ payload và không có link', () => {
    const result = presentNotification(
      make('admin_broadcast', { title: 'Bảo trì', body: '22h tối nay' }),
    );
    expect(result).toEqual({
      title: 'Bảo trì',
      body: '22h tối nay',
      href: null,
    });
  });

  it('type lạ không ném lỗi — rơi về bản tin chung', () => {
    const result = presentNotification(
      make('unknown_type' as NotificationDto['type'], {}),
    );
    expect(result.title).toBe('Thông báo mới');
    expect(result.href).toBeNull();
  });
});
