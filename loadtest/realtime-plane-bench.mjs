#!/usr/bin/env node
/**
 * Micro-benchmark cho "mặt phẳng realtime" trên một Redis cụ thể (docs/plans/2026-10-17-...).
 * Không thay thế load test end-to-end: nó đo hai thứ quyết định trần CCU của một Redis đơn lẻ:
 *   1. Chi phí lease/presence — mỗi socket sống refresh một Lua script mỗi lease/3.
 *   2. Chi phí fanout pub/sub — PSUBSCRIBE realtime:user:* (mọi pod nhận mọi event) so với
 *      SUBSCRIBE từng channel của user đang kết nối (mỗi event chỉ tới pod giữ user đó).
 *
 *   REDIS_URL=redis://127.0.0.1:6379 node loadtest/realtime-plane-bench.mjs
 *   USERS=20000 MESSAGES=40000 PODS=1,5,20,50 node loadtest/realtime-plane-bench.mjs
 *
 * Chỉ ghi key `bench:*` và channel `bench:user:*`; không đụng key của hệ thống. Số đo phụ thuộc
 * máy/mạng — đọc TỈ LỆ giữa các chế độ và `redisCpuMs`, không đọc số tuyệt đối.
 */
import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const USERS = Number(process.env.USERS ?? 20_000);
const MESSAGES = Number(process.env.MESSAGES ?? 40_000);
const PODS = (process.env.PODS ?? '1,5,20,50').split(',').map(Number);
const LEASE_MS = 90_000;
const CHUNK = 200;

// Giữ đồng bộ với apps/signaling-gateway/src/app/connection-quota.service.ts (hai biến thể refresh).
const REFRESH_FULL = `
local now = redis.call('TIME')
local now_ms = (now[1] * 1000) + math.floor(now[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms)
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return 0 end
redis.call('ZADD', KEYS[1], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1`;
const REFRESH_LEAN = `
local now = redis.call('TIME')
local now_ms = (now[1] * 1000) + math.floor(now[2] / 1000)
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return 0 end
redis.call('ZADD', KEYS[1], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1`;

const admin = new Redis(REDIS_URL);

async function redisCpuMs() {
  const info = await admin.info('cpu');
  const read = (key) =>
    Number(new RegExp(`${key}:([0-9.]+)`).exec(info)?.[1] ?? 0);
  return (read('used_cpu_sys') + read('used_cpu_user')) * 1000;
}

async function measure(label, run) {
  const cpu0 = await redisCpuMs();
  const t0 = performance.now();
  const ops = await run();
  const ms = performance.now() - t0;
  const cpu = (await redisCpuMs()) - cpu0;
  return {
    label,
    ops,
    ms: Math.round(ms),
    opsPerSec: Math.round((ops / ms) * 1000),
    redisCpuMs: Math.round(cpu),
    redisCpuUsPerOp: Math.round((cpu * 1000) / ops),
  };
}

async function cleanup() {
  let cursor = '0';
  do {
    const [next, keys] = await admin.scan(
      cursor,
      'MATCH',
      'bench:*',
      'COUNT',
      1000,
    );
    cursor = next;
    if (keys.length > 0) await admin.unlink(...keys);
  } while (cursor !== '0');
}

async function leaseBench() {
  const ids = Array.from({ length: USERS }, () => randomUUID());
  const seed = admin.pipeline();
  const now = Date.now();
  for (const id of ids) {
    seed.zadd(`bench:quota:${id}`, now + LEASE_MS, 'lease');
    seed.zadd(`bench:presence:${id}`, now + LEASE_MS, 'lease');
  }
  await seed.exec();

  const results = [];
  const inFlightCap = 256;
  // Mô phỏng hiện trạng: mỗi socket một timer → mỗi lease một round trip, nhiều lệnh cùng bay.
  const sequentialEval = (script, useSha) => async () => {
    const client = new Redis(REDIS_URL);
    if (useSha)
      client.defineCommand('refresh', { numberOfKeys: 2, lua: script });
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const keys = [`bench:quota:${id}`, `bench:presence:${id}`];
        if (useSha) await client.refresh(...keys, 'lease', LEASE_MS);
        else await client.eval(script, 2, ...keys, 'lease', LEASE_MS);
      }
    };
    await Promise.all(Array.from({ length: inFlightCap }, worker));
    client.disconnect();
    return ids.length;
  };
  const pipelinedSha = (script) => async () => {
    const client = new Redis(REDIS_URL);
    client.defineCommand('refresh', { numberOfKeys: 2, lua: script });
    for (let i = 0; i < ids.length; i += CHUNK) {
      const pipeline = client.pipeline();
      for (const id of ids.slice(i, i + CHUNK)) {
        pipeline.refresh(
          `bench:quota:${id}`,
          `bench:presence:${id}`,
          'lease',
          LEASE_MS,
        );
      }
      await pipeline.exec();
    }
    client.disconnect();
    return ids.length;
  };

  results.push(
    await measure(
      'EVAL full script, 1 lệnh/socket (hiện trạng)',
      sequentialEval(REFRESH_FULL, false),
    ),
  );
  results.push(
    await measure(
      'EVALSHA full script, 1 lệnh/socket',
      sequentialEval(REFRESH_FULL, true),
    ),
  );
  results.push(
    await measure(
      `EVALSHA full script, pipeline ${CHUNK}`,
      pipelinedSha(REFRESH_FULL),
    ),
  );
  results.push(
    await measure(
      `EVALSHA lean script, pipeline ${CHUNK}`,
      pipelinedSha(REFRESH_LEAN),
    ),
  );
  return results;
}

async function fanoutBench(pods) {
  const channelOf = (u) => `bench:user:${u}`;
  const make = async (mode) => {
    const subscribers = [];
    let delivered = 0;
    let parsed = 0;
    for (let p = 0; p < pods; p += 1) {
      const sub = new Redis(REDIS_URL);
      const mine = new Set();
      for (let u = p; u < USERS; u += pods) mine.add(channelOf(u));
      if (mode === 'pattern') {
        await sub.psubscribe('bench:user:*');
        sub.on('pmessage', (_pattern, channel, raw) => {
          // Hiện trạng: parse JSON TRƯỚC khi biết user có socket ở pod này không.
          const envelope = JSON.parse(raw);
          parsed += 1;
          if (mine.has(channel) && envelope.event) delivered += 1;
        });
      } else {
        const channels = [...mine];
        for (let i = 0; i < channels.length; i += 1000)
          await sub.subscribe(...channels.slice(i, i + 1000));
        sub.on('message', (_channel, raw) => {
          if (JSON.parse(raw).event) delivered += 1;
          parsed += 1;
        });
      }
      subscribers.push(sub);
    }
    return { subscribers, counters: () => ({ delivered, parsed }) };
  };

  const rows = [];
  for (const mode of ['pattern', 'user']) {
    const { subscribers, counters } = await make(mode);
    const payload = JSON.stringify({
      event: 'friend.message',
      data: { content: 'x'.repeat(120) },
    });
    const publisher = new Redis(REDIS_URL);
    const row = await measure(
      `${mode === 'pattern' ? 'PSUBSCRIBE (hiện trạng)' : 'SUBSCRIBE theo user'} — ${pods} pod`,
      async () => {
        for (let i = 0; i < MESSAGES; i += CHUNK) {
          const pipeline = publisher.pipeline();
          for (let j = i; j < Math.min(i + CHUNK, MESSAGES); j += 1) {
            pipeline.publish(channelOf(j % USERS), payload);
          }
          await pipeline.exec();
        }
        const expected = MESSAGES * (mode === 'pattern' ? pods : 1);
        const deadline = Date.now() + 30_000;
        while (counters().parsed < expected && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return MESSAGES;
      },
    );
    rows.push({
      ...row,
      deliveredToLocalSockets: counters().delivered,
      jsonParsedAcrossPods: counters().parsed,
    });
    publisher.disconnect();
    for (const sub of subscribers) sub.disconnect();
  }
  return rows;
}

try {
  console.log(`Redis ${REDIS_URL} — USERS=${USERS} MESSAGES=${MESSAGES}`);
  console.log('\n## Lease/presence refresh');
  console.table(await leaseBench());
  for (const pods of PODS) {
    console.log(`\n## Fanout pub/sub — ${pods} pod`);
    console.table(await fanoutBench(pods));
  }
} finally {
  await cleanup();
  admin.disconnect();
}
