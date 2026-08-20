import { WebPushSubscriptionService } from './web-push-subscription.service';

describe('WebPushSubscriptionService', () => {
  it('upsert lưu endpoint + key material theo user', async () => {
    const repo = {
      upsert: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      find: jest.fn(async () => []),
    };
    const service = new WebPushSubscriptionService(repo as never);

    await service.upsert('user-1', {
      endpoint: 'https://push.example/sub-1',
      expirationTime: null,
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    expect(repo.upsert).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        endpoint: 'https://push.example/sub-1',
        p256dh: 'p256dh',
        auth: 'auth',
      },
      ['endpoint'],
    );
  });

  it('remove chỉ xoá endpoint thuộc user hiện tại', async () => {
    const repo = {
      upsert: jest.fn(),
      delete: jest.fn(async () => undefined),
      find: jest.fn(),
    };
    const service = new WebPushSubscriptionService(repo as never);

    await service.remove('user-1', 'https://push.example/sub-1');

    expect(repo.delete).toHaveBeenCalledWith({
      userId: 'user-1',
      endpoint: 'https://push.example/sub-1',
    });
  });
});
