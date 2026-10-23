import { FriendMessageNotifier } from './friend-message-notifier.service';

const RECIPIENT = '00000000-0000-4000-8000-0000000000b2';
const SENDER = '00000000-0000-4000-8000-0000000000a1';
const INPUT = {
  conversationId: 'conv-1',
  senderUserId: SENDER,
  recipientId: RECIPIENT,
  preview: 'hi',
};
const GATE_KEY = `friend:msg-notify:${RECIPIENT}:conv-1`;

describe('FriendMessageNotifier (unit — gộp thông báo tin nhắn, ADR 0013)', () => {
  let windowSeconds: number;
  let gate: { tryAcquire: jest.Mock; release: jest.Mock };
  let memberStateRepo: { findOne: jest.Mock };
  let notificationService: { create: jest.Mock; sendPush: jest.Mock };
  let metrics: { observeNotify: jest.Mock };
  let notifier: FriendMessageNotifier;

  beforeEach(() => {
    windowSeconds = 60;
    gate = {
      tryAcquire: jest.fn(async () => true),
      release: jest.fn(async () => undefined),
    };
    memberStateRepo = { findOne: jest.fn(async () => null) };
    notificationService = {
      create: jest.fn(async (input) => ({ id: 'notif-1', ...input })),
      sendPush: jest.fn(async () => undefined),
    };
    metrics = { observeNotify: jest.fn() };
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS')
          return windowSeconds;
        throw new Error(`unexpected config ${key}`);
      },
    };
    notifier = new FriendMessageNotifier(
      memberStateRepo as never,
      notificationService as never,
      config as never,
      gate as never,
      metrics as never,
    );
  });

  it('tin đầu tiên trong cửa sổ → chiếm cổng, tạo notification + push đúng payload', async () => {
    await notifier.notify(INPUT);

    expect(gate.tryAcquire).toHaveBeenCalledWith(GATE_KEY, 60);
    expect(notificationService.create).toHaveBeenCalledWith({
      userId: RECIPIENT,
      type: 'friend_message',
      payload: {
        conversationId: 'conv-1',
        senderUserId: SENDER,
        preview: 'hi',
      },
    });
    expect(notificationService.sendPush).toHaveBeenCalledTimes(1);
    expect(gate.release).not.toHaveBeenCalled();
    expect(metrics.observeNotify).toHaveBeenCalledWith('notified');
  });

  it('cổng đã đóng (đã thông báo trong cửa sổ) → không đụng DB, không notification, không push', async () => {
    gate.tryAcquire.mockResolvedValue(false);

    await notifier.notify(INPUT);

    expect(memberStateRepo.findOne).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
    expect(notificationService.sendPush).not.toHaveBeenCalled();
    expect(metrics.observeNotify).toHaveBeenCalledWith('coalesced');
  });

  it('cửa sổ 0 = tắt gộp: không gọi cổng, mỗi tin một thông báo (hành vi cũ)', async () => {
    windowSeconds = 0;

    await notifier.notify(INPUT);
    await notifier.notify(INPUT);

    expect(gate.tryAcquire).not.toHaveBeenCalled();
    expect(notificationService.create).toHaveBeenCalledTimes(2);
    expect(notificationService.sendPush).toHaveBeenCalledTimes(2);
    expect(gate.release).not.toHaveBeenCalled();
  });

  it('Redis (cổng) lỗi → fail-open: vẫn thông báo như cũ, không cố mở lại cổng chưa chiếm', async () => {
    gate.tryAcquire.mockRejectedValue(new Error('redis down'));

    await notifier.notify(INPUT);

    expect(notificationService.create).toHaveBeenCalledTimes(1);
    expect(notificationService.sendPush).toHaveBeenCalledTimes(1);
    expect(gate.release).not.toHaveBeenCalled();
    expect(metrics.observeNotify).toHaveBeenCalledWith('gate_error');
    expect(metrics.observeNotify).toHaveBeenCalledWith('notified');
  });

  it('người nhận đã mute → không notification/push và MỞ LẠI cổng (bật tiếng lại thì tin kế tiếp có thông báo)', async () => {
    memberStateRepo.findOne.mockResolvedValue({ mutedAt: new Date() });

    await notifier.notify(INPUT);

    expect(notificationService.create).not.toHaveBeenCalled();
    expect(notificationService.sendPush).not.toHaveBeenCalled();
    expect(gate.release).toHaveBeenCalledWith(GATE_KEY);
    expect(metrics.observeNotify).toHaveBeenCalledWith('muted');
  });

  it('tạo notification lỗi → ném lỗi cho caller VÀ mở lại cổng để tin kế tiếp không bị nuốt', async () => {
    notificationService.create.mockRejectedValue(new Error('db down'));

    await expect(notifier.notify(INPUT)).rejects.toThrow('db down');

    expect(gate.release).toHaveBeenCalledWith(GATE_KEY);
    expect(notificationService.sendPush).not.toHaveBeenCalled();
    expect(metrics.observeNotify).toHaveBeenCalledWith('error');
  });

  it('mở lại cổng lỗi bị nuốt (cửa sổ tự hết hạn) — không che lỗi/kết quả chính', async () => {
    memberStateRepo.findOne.mockResolvedValue({ mutedAt: new Date() });
    gate.release.mockRejectedValue(new Error('redis down'));

    await expect(notifier.notify(INPUT)).resolves.toBeUndefined();
  });

  it('push luôn chạy SAU khi notification đã được tạo, dùng đúng bản ghi vừa tạo', async () => {
    const order: string[] = [];
    notificationService.create.mockImplementation(async (input) => {
      order.push('create');
      return { id: 'notif-9', ...input };
    });
    notificationService.sendPush.mockImplementation(async (n) => {
      order.push(`push:${n.id}`);
    });

    await notifier.notify(INPUT);

    expect(order).toEqual(['create', 'push:notif-9']);
  });

  it('metrics là tuỳ chọn: thiếu FriendMetrics vẫn chạy bình thường', async () => {
    const bare = new FriendMessageNotifier(
      memberStateRepo as never,
      notificationService as never,
      {
        getOrThrow: () => windowSeconds,
      } as never,
      gate as never,
    );

    await expect(bare.notify(INPUT)).resolves.toBeUndefined();
    expect(notificationService.create).toHaveBeenCalledTimes(1);
  });
});
