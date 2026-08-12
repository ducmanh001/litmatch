import 'reflect-metadata';

import { RedisPresenceReader } from './redis-presence-reader.adapter';

describe('RedisPresenceReader', () => {
  it('dọn lease hết hạn rồi trả online khi còn socket', async () => {
    const redis = {
      zremrangebyscore: jest.fn(),
      zcard: jest.fn().mockResolvedValue(1),
    };
    const reader = new RedisPresenceReader(redis as never);

    await expect(reader.isOnline('u1')).resolves.toBe(true);
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      'realtime:presence:u1',
      '-inf',
      expect.any(Number),
    );
  });

  it('Redis lỗi thì fail closed và không đọc trạng thái tiếp', async () => {
    const redis = {
      zremrangebyscore: jest.fn().mockRejectedValue(new Error('down')),
      zcard: jest.fn(),
    };
    const reader = new RedisPresenceReader(redis as never);

    await expect(reader.isOnline('u1')).resolves.toBe(false);
    expect(redis.zcard).not.toHaveBeenCalled();
  });
});
