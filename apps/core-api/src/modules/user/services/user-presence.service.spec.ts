import { UserPresenceService } from './user-presence.service';

describe('UserPresenceService', () => {
  it('dọn lease hết hạn rồi trả online khi còn socket', async () => {
    const redis = {
      zremrangebyscore: jest.fn(),
      zcard: jest.fn().mockResolvedValue(1),
    };
    const service = new UserPresenceService(redis as never);

    await expect(service.isOnline('u1')).resolves.toBe(true);
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      'realtime:presence:u1',
      '-inf',
      expect.any(Number),
    );
  });

  it('Redis lỗi → fail closed thành offline', async () => {
    const redis = {
      zremrangebyscore: jest.fn().mockRejectedValue(new Error('down')),
      zcard: jest.fn(),
    };
    const service = new UserPresenceService(redis as never);

    await expect(service.isOnline('u1')).resolves.toBe(false);
    expect(redis.zcard).not.toHaveBeenCalled();
  });
});
