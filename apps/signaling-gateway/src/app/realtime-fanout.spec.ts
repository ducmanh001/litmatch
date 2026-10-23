import 'reflect-metadata'; // common-dtos kéo class-validator (cần Reflect.getMetadata)
import { EventEmitter } from 'node:events';

import { realtimeShardIndex, realtimeUserChannel } from '@litmatch/common-dtos';

import { RealtimeFanout } from './realtime-fanout';

import type Redis from 'ioredis';
import type { FanoutMode } from './realtime-fanout';

class FakeSubscriber extends EventEmitter {
  status = 'ready';
  subscribe = jest.fn(async (...channels: string[]) => channels.length);
  unsubscribe = jest.fn(async (...channels: string[]) => channels.length);
  psubscribe = jest.fn(async (...patterns: string[]) => patterns.length);
  quit = jest.fn(async () => 'OK');
  disconnect = jest.fn();
}

/** Tìm `count` userId thuộc đúng shard để test không phụ thuộc may rủi của hash. */
function usersOnShard(shard: number, shardCount: number, count: number) {
  const ids: string[] = [];
  for (let index = 0; ids.length < count; index += 1) {
    const id = `user-${index}`;
    if (realtimeShardIndex(id, shardCount) === shard) ids.push(id);
  }
  return ids;
}

function makeFanout(options: { shards?: number; mode?: FanoutMode } = {}) {
  const shards = options.shards ?? 1;
  const clients: FakeSubscriber[] = [];
  const onEvent = jest.fn();
  const logger = { warn: jest.fn(), error: jest.fn() };
  const onError = jest.fn();
  const fanout = new RealtimeFanout({
    urls: Array.from(
      { length: shards },
      (_, index) => `redis://shard-${index}`,
    ),
    mode: options.mode ?? 'user',
    onEvent,
    logger,
    onError,
    createClient: () => {
      const client = new FakeSubscriber();
      clients.push(client);
      return client as unknown as Redis;
    },
  });
  return { fanout, clients, onEvent, logger, onError };
}

/** Cho các microtask (reconcile bất đồng bộ) chạy xong. */
const flush = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

describe('RealtimeFanout — chế độ user', () => {
  it('chỉ SUBSCRIBE channel của user, trên đúng shard của user đó', async () => {
    const { fanout, clients } = makeFanout({ shards: 2 });
    await flush();
    const [onShard0] = usersOnShard(0, 2, 1);
    const [onShard1] = usersOnShard(1, 2, 1);

    await fanout.subscribeUser(onShard0);
    await fanout.subscribeUser(onShard1);

    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    expect(clients[0].subscribe).toHaveBeenCalledWith(
      realtimeUserChannel(onShard0),
    );
    expect(clients[1].subscribe).toHaveBeenCalledWith(
      realtimeUserChannel(onShard1),
    );
    expect(clients[0].psubscribe).not.toHaveBeenCalled();
    expect(fanout.subscribedUsers).toBe(2);
  });

  it('socket thứ hai của cùng user không SUBSCRIBE lại nhưng chờ cùng xác nhận', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    let confirm!: () => void;
    clients[0].subscribe.mockReturnValueOnce(
      new Promise<number>((resolve) => (confirm = () => resolve(1))),
    );

    let secondDone = false;
    const first = fanout.subscribeUser('user-a');
    const second = fanout.subscribeUser('user-a').then(() => {
      secondDone = true;
    });
    await flush();

    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    expect(secondDone).toBe(false);
    confirm();
    await Promise.all([first, second]);
    expect(secondDone).toBe(true);
  });

  it('chỉ UNSUBSCRIBE khi socket cuối cùng của user rời pod', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a');
    await fanout.subscribeUser('user-a');

    fanout.releaseUser('user-a');
    expect(clients[0].unsubscribe).not.toHaveBeenCalled();
    expect(fanout.subscribedUsers).toBe(1);

    fanout.releaseUser('user-a');
    expect(clients[0].unsubscribe).toHaveBeenCalledWith(
      realtimeUserChannel('user-a'),
    );
    expect(fanout.subscribedUsers).toBe(0);
    // release thừa không được làm đếm âm hay UNSUBSCRIBE lần hai.
    fanout.releaseUser('user-a');
    expect(clients[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('SUBSCRIBE lỗi → reject; caller release thì không còn user mồ côi', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    clients[0].subscribe.mockRejectedValueOnce(new Error('timeout'));

    await expect(fanout.subscribeUser('user-a')).rejects.toThrow('timeout');
    fanout.releaseUser('user-a');

    expect(fanout.subscribedUsers).toBe(0);
    // UNSUBSCRIBE best-effort phòng SUBSCRIBE đã áp dụng ở server nhưng reply bị mất.
    expect(clients[0].unsubscribe).toHaveBeenCalledWith(
      realtimeUserChannel('user-a'),
    );
  });

  it('message Redis được chuyển nguyên văn cho onEvent', async () => {
    const { fanout, clients, onEvent } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a');

    clients[0].emit('message', realtimeUserChannel('user-a'), '{"event":"x"}');

    expect(onEvent).toHaveBeenCalledWith(
      realtimeUserChannel('user-a'),
      '{"event":"x"}',
    );
  });

  it('sẵn sàng ngay khi chưa có user nào; mất kết nối thì chưa sẵn sàng', async () => {
    const { fanout, clients } = makeFanout({ shards: 2 });
    expect(fanout.isReady()).toBe(false); // reconcile chưa chạy xong
    await flush();
    expect(fanout.isReady()).toBe(true);
    expect(clients[0].subscribe).not.toHaveBeenCalled(); // SUBSCRIBE không đối số là lỗi

    clients[1].emit('close');
    expect(fanout.isReady()).toBe(false);
  });

  it('reconnect: subscribe lại đúng các user còn socket, không khôi phục user đã rời', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a');
    await fanout.subscribeUser('user-b');
    await fanout.subscribeUser('user-c');
    clients[0].emit('close');
    clients[0].status = 'reconnecting';
    // user-b rời khi Redis đang mất kết nối: UNSUBSCRIBE bị từ chối (offline queue tắt).
    clients[0].unsubscribe.mockRejectedValueOnce(new Error('not writable'));
    fanout.releaseUser('user-b');
    clients[0].subscribe.mockClear();

    clients[0].status = 'ready';
    clients[0].emit('ready');
    await flush();

    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    expect(new Set(clients[0].subscribe.mock.calls[0])).toEqual(
      new Set([realtimeUserChannel('user-a'), realtimeUserChannel('user-c')]),
    );
    expect(fanout.isReady()).toBe(true);
  });

  it('reconnect với hàng nghìn user: chia lô SUBSCRIBE, mỗi lô tối đa 1000 channel', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    for (let index = 0; index < 2_500; index += 1) {
      await fanout.subscribeUser(`user-${index}`);
    }
    clients[0].subscribe.mockClear();

    clients[0].emit('ready');
    await flush();
    await flush();

    expect(clients[0].subscribe.mock.calls.map((call) => call.length)).toEqual([
      1_000, 1_000, 500,
    ]);
  });

  it('khôi phục thất bại → báo lỗi, chưa sẵn sàng, tự thử lại rồi sẵn sàng', async () => {
    jest.useFakeTimers();
    try {
      const { fanout, clients, onError } = makeFanout();
      await jest.advanceTimersByTimeAsync(0);
      await fanout.subscribeUser('user-a');
      clients[0].subscribe.mockRejectedValueOnce(new Error('timeout'));

      clients[0].emit('ready');
      await jest.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'signaling-redis-subscription',
      );
      expect(fanout.isReady()).toBe(false);

      await jest.advanceTimersByTimeAsync(3_100);
      expect(fanout.isReady()).toBe(true);
      await fanout.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('close() QUIT từng shard; QUIT lỗi thì ngắt cưỡng bức', async () => {
    const { fanout, clients } = makeFanout({ shards: 2 });
    await flush();
    clients[1].quit.mockRejectedValueOnce(new Error("Stream isn't writeable"));

    await fanout.close();

    expect(clients[0].quit).toHaveBeenCalledTimes(1);
    expect(clients[0].disconnect).not.toHaveBeenCalled();
    expect(clients[1].disconnect).toHaveBeenCalledTimes(1);
    expect(fanout.isReady()).toBe(false);
  });
});

describe('RealtimeFanout — chế độ pattern (đường lùi)', () => {
  it('PSUBSCRIBE realtime:user:* khi sẵn sàng; subscribe/release theo user là no-op', async () => {
    const { fanout, clients, onEvent } = makeFanout({ mode: 'pattern' });
    await flush();

    expect(clients[0].psubscribe).toHaveBeenCalledWith('realtime:user:*');
    await fanout.subscribeUser('user-a');
    fanout.releaseUser('user-a');
    expect(clients[0].subscribe).not.toHaveBeenCalled();
    expect(clients[0].unsubscribe).not.toHaveBeenCalled();
    expect(fanout.subscribedUsers).toBe(0);
    expect(fanout.isReady()).toBe(true);

    clients[0].emit(
      'pmessage',
      'realtime:user:*',
      'realtime:user:user-a',
      '{}',
    );
    expect(onEvent).toHaveBeenCalledWith('realtime:user:user-a', '{}');
  });
});

describe('RealtimeFanout — readiness theo shard, subscribe lại, tắt', () => {
  it('isShardReady tách từng shard; isReady chỉ true khi mọi shard sẵn sàng', async () => {
    const { fanout, clients } = makeFanout({ shards: 3 });
    await flush();
    expect(fanout.isReady()).toBe(true);

    clients[1].emit('close');

    expect(fanout.isShardReady(0)).toBe(true);
    expect(fanout.isShardReady(1)).toBe(false);
    expect(fanout.isShardReady(2)).toBe(true);
    expect(fanout.isShardReady(3)).toBe(false); // không có shard thứ tư
    expect(fanout.isReady()).toBe(false);
  });

  it('socket thứ hai của cùng user khi shard đang mất kết nối → subscribe lại và fail closed (không dùng promise cũ đã resolve)', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a'); // socket đầu: subscribe thành công
    clients[0].emit('close');
    clients[0].status = 'reconnecting';
    clients[0].subscribe.mockClear();
    clients[0].subscribe.mockRejectedValueOnce(new Error('not writable'));

    await expect(fanout.subscribeUser('user-a')).rejects.toThrow(
      'not writable',
    );

    expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    expect(clients[0].subscribe).toHaveBeenCalledWith(
      realtimeUserChannel('user-a'),
    );
  });

  it('subscribe lỗi lúc Redis đứt rồi Redis lên lại → socket mới của user đang có socket khác vẫn vào được (không dùng lại promise đã reject)', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a'); // socket 1: thành công
    clients[0].emit('close');
    clients[0].status = 'reconnecting';
    clients[0].subscribe.mockRejectedValueOnce(new Error('not writable'));
    await expect(fanout.subscribeUser('user-a')).rejects.toThrow(
      'not writable',
    );
    fanout.releaseUser('user-a'); // gateway nhả lượt thất bại; socket 1 vẫn còn

    // Redis hồi phục: reconcile subscribe lại mọi user còn socket.
    clients[0].status = 'ready';
    clients[0].emit('ready');
    await flush();
    expect(fanout.isShardReady(0)).toBe(true);

    await expect(fanout.subscribeUser('user-a')).resolves.toBeUndefined();
    expect(fanout.subscribedUsers).toBe(1);
  });

  it('socket thứ hai khi shard đã sẵn sàng thì KHÔNG subscribe lại', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a');
    clients[0].subscribe.mockClear();

    await fanout.subscribeUser('user-a');

    expect(clients[0].subscribe).not.toHaveBeenCalled();
  });

  it('beginClose: socket rời lúc shutdown không gửi UNSUBSCRIBE và không khôi phục subscription nữa', async () => {
    const { fanout, clients } = makeFanout();
    await flush();
    await fanout.subscribeUser('user-a');
    await fanout.subscribeUser('user-b');
    clients[0].subscribe.mockClear();

    fanout.beginClose();
    fanout.releaseUser('user-a');
    fanout.releaseUser('user-b');
    clients[0].emit('ready'); // kết nối nối lại trong lúc đang tắt
    await flush();

    expect(clients[0].unsubscribe).not.toHaveBeenCalled();
    expect(clients[0].subscribe).not.toHaveBeenCalled();
    expect(fanout.subscribedUsers).toBe(0);

    await fanout.close();
    expect(clients[0].quit).toHaveBeenCalledTimes(1);
  });
});
