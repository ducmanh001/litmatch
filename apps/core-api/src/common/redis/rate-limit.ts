import type Redis from 'ioredis';

/**
 * INCR + EXPIRE-lần-đầu + check-quá-giới-hạn trong 1 Lua atomic — tránh race giữa nhiều request
 * đồng thời của cùng 1 key (docs/11 § DRY có chọn lọc: hạ tầng trung lập, ≥2 chỗ cần cùng hành
 * vi). Trả -1 = vượt giới hạn (đã tự DECR lại, lượt bị chặn không tiêu slot).
 */
const RATE_LIMIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return -1
end
return c
`;

/** true = còn trong hạn mức (đã tính lượt này), false = vượt giới hạn (lượt này KHÔNG tính). */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await redis.eval(
    RATE_LIMIT_LUA,
    1,
    key,
    String(max),
    String(windowSeconds),
  );
  return result !== -1;
}
