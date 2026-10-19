import { RedisWindowGateAdapter } from './redis-window-gate.adapter';

describe('RedisWindowGateAdapter', () => {
  let redis: { set: jest.Mock; del: jest.Mock };
  let gate: RedisWindowGateAdapter;

  beforeEach(() => {
    redis = { set: jest.fn(async () => 'OK'), del: jest.fn(async () => 1) };
    gate = new RedisWindowGateAdapter(redis as never);
  });

  it('lần đầu trong cửa sổ: SET NX EX thành công → true', async () => {
    await expect(gate.tryAcquire('k', 60)).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith('k', '1', 'EX', 60, 'NX');
  });

  it('đã có trong cửa sổ: SET NX trả null → false', async () => {
    redis.set.mockResolvedValue(null);
    await expect(gate.tryAcquire('k', 60)).resolves.toBe(false);
  });

  it('release xoá đúng key', async () => {
    await gate.release('k');
    expect(redis.del).toHaveBeenCalledWith('k');
  });

  it.each([
    ['key rỗng', '', 60],
    ['cửa sổ 0', 'k', 0],
    ['cửa sổ âm', 'k', -1],
    ['cửa sổ không nguyên', 'k', 1.5],
  ])('từ chối tham số sai (%s) mà không chạm Redis', async (_n, key, win) => {
    await expect(gate.tryAcquire(key, win)).rejects.toThrow();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('lỗi Redis được ném ra để caller tự quyết fail-open', async () => {
    redis.set.mockRejectedValue(new Error('redis down'));
    await expect(gate.tryAcquire('k', 60)).rejects.toThrow('redis down');
  });
});
