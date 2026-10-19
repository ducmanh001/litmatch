#!/usr/bin/env node
/**
 * Mô hình năng lực (tất định) cho kịch bản của docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md.
 *
 *   pnpm capacity:model                              # kịch bản mặc định (10 triệu CCU, 10.000 người chat, 10 triệu lượt ghép/ngày)
 *   pnpm capacity:model --ccu=2000000 --chatters=5000
 *   pnpm capacity:model --json
 *
 * ĐÂY KHÔNG PHẢI KẾT QUẢ ĐO. Mỗi hằng số có nguồn ghi rõ trong DEFAULTS:
 *   - "đo"     : `loadtest/realtime-plane-bench.mjs` trên Redis 7 (Docker, máy dev) — chạy lại trên hạ tầng thật;
 *   - "đọc mã" : đếm câu lệnh trong code (file:line trong plan), chưa đo bằng pg_stat_statements;
 *   - "giả định": con số cần thay bằng số đo của chính hệ thống trước khi dùng để mua hạ tầng.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = {
  // --- Tải (đề bài: 10 triệu đồng thời, 10.000 người nhắn tin, 10 triệu lượt ghép đôi) ---
  ccu: 10_000_000, // đề bài — "10 triệu lượt dùng đồng thời", hiểu là socket/presence đồng thời
  chatters: 10_000, // đề bài — "10.000 người nhắn tin", hiểu là đang nhắn đồng thời
  matchesPerDay: 10_000_000, // đề bài — hiểu là mỗi ngày (giả định: đề bài không nêu cửa sổ thời gian)
  // --- Hành vi (giả định) ---
  socketsPerUser: 1.1, // giả định: nhiều tab/thiết bị
  socketsPerPod: 50_000, // giả định: cần benchmark Socket.IO thật trên node đích
  messagesPerChatterPerSec: 0.3, // giả định: ~1 tin / 3 giây khi đang chat
  matchPeakFactor: 10, // giả định: giờ cao điểm / trung bình ngày
  voiceShare: 0.5, // giả định
  avgCallSeconds: 300, // giả định
  otherEventsPerCcuPerSec: 0.001, // giả định: streak, party, gift, presence... trên mỗi CCU
  // --- Redis (đo, loadtest/realtime-plane-bench.mjs) ---
  leaseMs: 90_000, // mặc định WS_CONNECTION_LEASE_MS
  leaseRefreshDivisor: 3, // chu kỳ gia hạn = lease / 3
  leaseUsPerOpBefore: 29, // đo: EVAL từng socket
  leaseUsPerOpAfter: 16, // đo: EVALSHA + pipeline 200
  pubsubUsBase: 1.6, // đo, hồi quy tuyến tính trên 1/10/40 pod: µs = base + perPod × pod
  pubsubUsPerPod: 1.4,
  pubsubUsPerUserSubscribe: 5, // đo: 3–7 µs bất kể số pod
  redisTargetUtilization: 0.5, // chừa headroom cho đợt reconnect và failover
  // --- Matching (giả định) ---
  msPerPair: 30, // giả định: ~15 câu lệnh DB + vài lệnh Redis, một worker
  matcherConcurrency: 2, // MATCHING_MATCHER_CONCURRENCY
  // --- Postgres (đọc mã + giả định) ---
  stmtsPerPairBefore: 14, // đọc mã: BEGIN, khoá ticket, đọc user, canPair 4 truy vấn, INSERT session, save 2 ticket (3), 2 notification, COMMIT
  stmtsPerPairAfter: 12, // đọc mã: 2 đọc cửa sổ, canPair lọc (1), BEGIN, khoá ticket, đọc user, canPair dưới lock (1), INSERT, UPDATE ticket, 2 notification, COMMIT
  stmtsPerSoulMessage: 6, // đọc mã
  stmtsPerFriendMessageBefore: 18, // đọc mã
  stmtsPerFriendMessageAfter: 13, // đọc mã: bỏ ~5 câu lệnh transaction streak ở đường nhanh (CHƯA tính cổng gộp thông báo bên dưới)
  friendNotifyWindowSeconds: 60, // FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS (ADR 0013); 0 = tắt gộp
  stmtsSavedPerGatedFriendMessage: 3, // đọc mã: tin bị gộp bỏ đọc member state + INSERT notification + đọc web-push subscription
  friendChatShare: 0.5, // giả định: nửa số tin là chat bạn bè, nửa là chat ẩn danh Soul
  pgStmtsPerSecPerPrimary: 20_000, // giả định: cần pgbench/thực đo trên instance đích
  pgTargetUtilization: 0.5,
  bytesPerMessageRow: 400, // giả định: hàng + index
  bytesPerMatchRows: 1_100, // giả định: 2 ticket + 1 session + 2 notification
  chatHoursPerDay: 8, // giả định: số giờ/ngày tải chat ở mức đỉnh
  // --- Media (giả định) ---
  participantsPerMediaNode: 2_000, // giả định: audio-only; cần benchmark LiveKit riêng (docs/03 § 3.5)
  mediaTargetUtilization: 0.6,
  // --- API ---
  reqPerCcuPerSecRepoModel: 0.2, // docs/plans/2026-10-08: mô hình minh hoạ của repo
  activeFraction: 0.01, // giả định cho kịch bản B: chỉ 1% socket đang thao tác
  reqPerActiveUserPerSec: 1,
};

const ceil = (value) => Math.max(1, Math.ceil(value));
const round = (value, digits = 1) => Number(value.toFixed(digits));

export function computeModel(overrides = {}) {
  const p = { ...DEFAULTS, ...overrides };

  const sockets = p.ccu * p.socketsPerUser;
  const pods = ceil(sockets / p.socketsPerPod);
  const refreshSeconds = p.leaseMs / p.leaseRefreshDivisor / 1000;
  const leaseOpsPerSec = sockets / refreshSeconds;

  const messagesPerSec = p.chatters * p.messagesPerChatterPerSec;
  const matchesPerSecAvg = p.matchesPerDay / 86_400;
  const matchesPerSecPeak = matchesPerSecAvg * p.matchPeakFactor;
  const eventsPerSec =
    messagesPerSec * 2 + // người gửi và người nhận cùng nhận event
    matchesPerSecPeak * 2 + // match.confirmed cho cả hai
    p.ccu * p.otherEventsPerCcuPerSec;

  const usable = p.redisTargetUtilization * 1_000_000; // µs CPU dùng được mỗi giây của một core Redis
  const leaseCoresBefore = (leaseOpsPerSec * p.leaseUsPerOpBefore) / 1e6;
  const leaseCoresAfter = (leaseOpsPerSec * p.leaseUsPerOpAfter) / 1e6;
  const pubsubUsPattern = p.pubsubUsBase + p.pubsubUsPerPod * pods;
  const pubsubCoresPattern = (eventsPerSec * pubsubUsPattern) / 1e6;
  const pubsubCoresUser = (eventsPerSec * p.pubsubUsPerUserSubscribe) / 1e6;
  const shardsBefore = ceil(
    (leaseCoresBefore + pubsubCoresPattern) / p.redisTargetUtilization,
  );
  const shardsAfter = ceil(
    (leaseCoresAfter + pubsubCoresUser) / p.redisTargetUtilization,
  );

  const pairsPerPod = (p.matcherConcurrency * 1000) / p.msPerPair;
  const matcherPods = ceil(matchesPerSecPeak / pairsPerPod);
  const callsConcurrent = matchesPerSecPeak * p.voiceShare * p.avgCallSeconds;
  const participants = callsConcurrent * 2;

  const friendMsgs = messagesPerSec * p.friendChatShare;
  const soulMsgs = messagesPerSec - friendMsgs;
  // Cổng gộp thông báo: mỗi chuỗi (người gửi → người nhận) chỉ tin đầu tiên trong cửa sổ mở cổng.
  const msgsPerWindowPerChatter =
    p.messagesPerChatterPerSec * p.friendNotifyWindowSeconds;
  const notifyOpenFraction =
    p.friendNotifyWindowSeconds > 0
      ? Math.min(1, 1 / Math.max(1, msgsPerWindowPerChatter))
      : 1;
  const stmtsPerFriendMessageAfter =
    p.stmtsPerFriendMessageAfter -
    p.stmtsSavedPerGatedFriendMessage * (1 - notifyOpenFraction);
  const stmtsBefore =
    friendMsgs * p.stmtsPerFriendMessageBefore +
    soulMsgs * p.stmtsPerSoulMessage +
    matchesPerSecPeak * p.stmtsPerPairBefore;
  const stmtsAfter =
    friendMsgs * stmtsPerFriendMessageAfter +
    soulMsgs * p.stmtsPerSoulMessage +
    matchesPerSecPeak * p.stmtsPerPairAfter;
  const pgBudget = p.pgStmtsPerSecPerPrimary * p.pgTargetUtilization;

  const messagesPerDay = messagesPerSec * p.chatHoursPerDay * 3600;

  return {
    inputs: p,
    realtime: {
      sockets: Math.round(sockets),
      gatewayPods: pods,
      leaseRefreshSeconds: refreshSeconds,
      leaseOpsPerSec: Math.round(leaseOpsPerSec),
      eventsPerSec: Math.round(eventsPerSec),
      redisCores: {
        leaseBefore: round(leaseCoresBefore, 2),
        leaseAfter: round(leaseCoresAfter, 2),
        pubsubPattern: round(pubsubCoresPattern, 2),
        pubsubPerUser: round(pubsubCoresUser, 2),
      },
      pubsubMicrosPerEventPattern: round(pubsubUsPattern, 1),
      // Một Redis đơn lẻ dùng được ~1 core: số shard để mỗi shard ≤ mục tiêu sử dụng.
      redisShardsBefore: shardsBefore,
      redisShardsAfter: shardsAfter,
      singleRedisUsableMicrosPerSec: usable,
    },
    matching: {
      pairsPerSecAvg: round(matchesPerSecAvg, 1),
      pairsPerSecPeak: round(matchesPerSecPeak, 1),
      pairsPerSecPerPod: round(pairsPerPod, 1),
      matcherPodsAtPeak: matcherPods,
    },
    chat: {
      messagesPerSec: round(messagesPerSec, 1),
      messagesPerDay: Math.round(messagesPerDay),
      gbPerDayMessages: round((messagesPerDay * p.bytesPerMessageRow) / 1e9, 1),
      gbPerDayMatches: round((p.matchesPerDay * p.bytesPerMatchRows) / 1e9, 1),
      // Mỗi tin bạn bè từng tạo một notification; cổng gộp chỉ cho tin đầu mỗi cửa sổ.
      friendNotificationInsertsPerSecBefore: round(friendMsgs, 1),
      friendNotificationInsertsPerSecAfter: round(
        friendMsgs * notifyOpenFraction,
        1,
      ),
      friendNotificationReductionPct: round((1 - notifyOpenFraction) * 100, 1),
    },
    postgres: {
      stmtsPerSecBefore: Math.round(stmtsBefore),
      stmtsPerSecAfter: Math.round(stmtsAfter),
      primariesBefore: ceil(stmtsBefore / pgBudget),
      primariesAfter: ceil(stmtsAfter / pgBudget),
      budgetPerPrimary: pgBudget,
    },
    media: {
      concurrentCallsAtPeak: Math.round(callsConcurrent),
      concurrentParticipants: Math.round(participants),
      nodes: ceil(
        participants / (p.participantsPerMediaNode * p.mediaTargetUtilization),
      ),
    },
    api: {
      scenarioA_repoModelRps: Math.round(p.ccu * p.reqPerCcuPerSecRepoModel),
      scenarioB_activeOnlyRps: Math.round(
        p.ccu * p.activeFraction * p.reqPerActiveUserPerSec,
      ),
    },
  };
}

export function renderReport(model) {
  const {
    realtime: r,
    matching: m,
    chat: c,
    postgres: d,
    media: v,
    api: a,
  } = model;
  const n = (value) => value.toLocaleString('en-US');
  return [
    `# Mô hình năng lực — ${n(model.inputs.ccu)} CCU, ${n(model.inputs.chatters)} người đang chat, ${n(model.inputs.matchesPerDay)} lượt ghép/ngày`,
    '',
    'Không phải kết quả đo: các hằng số và nguồn của chúng nằm trong `DEFAULTS` (scripts/capacity/model.mjs).',
    '',
    '## Mặt phẳng realtime (Redis)',
    `- Socket: ${n(r.sockets)} → ${n(r.gatewayPods)} pod gateway (${n(model.inputs.socketsPerPod)} socket/pod, giả định).`,
    `- Gia hạn lease: ${n(r.leaseOpsPerSec)} lệnh/giây (mỗi ${r.leaseRefreshSeconds}s/socket).`,
    `- Event pub/sub: ${n(r.eventsPerSec)}/giây; PSUBSCRIBE tốn ${r.pubsubMicrosPerEventPattern} µs CPU Redis/event ở ${r.gatewayPods} pod.`,
    '',
    '| | Trước (EVAL từng socket + PSUBSCRIBE) | Sau (EVALSHA gộp lô + SUBSCRIBE theo user) |',
    '| --- | ---: | ---: |',
    `| CPU lease (core Redis) | ${r.redisCores.leaseBefore} | ${r.redisCores.leaseAfter} |`,
    `| CPU pub/sub (core Redis) | ${r.redisCores.pubsubPattern} | ${r.redisCores.pubsubPerUser} |`,
    `| Số Redis shard tối thiểu (≤ ${model.inputs.redisTargetUtilization * 100}% CPU/shard) | ${n(r.redisShardsBefore)} | ${n(r.redisShardsAfter)} |`,
    '',
    '## Ghép đôi',
    `- ${m.pairsPerSecAvg} cặp/giây trung bình, ${m.pairsPerSecPeak} cặp/giây giờ cao điểm.`,
    `- Một pod matcher ≈ ${m.pairsPerSecPerPod} cặp/giây (${model.inputs.matcherConcurrency} worker × ${model.inputs.msPerPair} ms/cặp, giả định) → ${n(m.matcherPodsAtPeak)} pod matcher ở cao điểm.`,
    `- Voice: ${n(v.concurrentCallsAtPeak)} cuộc gọi đồng thời (${n(v.concurrentParticipants)} người) → ≥ ${n(v.nodes)} node media (${n(model.inputs.participantsPerMediaNode)} người/node, giả định).`,
    '',
    '## Chat và dữ liệu',
    `- ${c.messagesPerSec} tin/giây → ${n(c.messagesPerDay)} tin/ngày ≈ ${c.gbPerDayMessages} GB/ngày (bảng message); ghép đôi ≈ ${c.gbPerDayMatches} GB/ngày (ticket + session + notification).`,
    `- Notification tin bạn bè: ${n(c.friendNotificationInsertsPerSecBefore)} → ${n(c.friendNotificationInsertsPerSecAfter)} insert/giây (cổng gộp ${model.inputs.friendNotifyWindowSeconds}s, ít hơn ${c.friendNotificationReductionPct}%).`,
    `- Postgres: ${n(d.stmtsPerSecBefore)} → ${n(d.stmtsPerSecAfter)} câu lệnh/giây ở cao điểm; ngân sách ${n(d.budgetPerPrimary)}/primary → ${d.primariesBefore} → ${d.primariesAfter} primary.`,
    '',
    '## API (hai cách hiểu "10 triệu đồng thời")',
    `- A) mô hình của repo (${model.inputs.reqPerCcuPerSecRepoModel} req/CCU/giây): ${n(a.scenarioA_repoModelRps)} RPS.`,
    `- B) chỉ ${model.inputs.activeFraction * 100}% socket đang thao tác: ${n(a.scenarioB_activeOnlyRps)} RPS.`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const overrides = {};
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    const match = /^--([A-Za-z0-9]+)=(.+)$/.exec(arg);
    if (!match || !(match[1] in DEFAULTS)) {
      throw new Error(
        `Tham số không hợp lệ: ${arg} (khoá hợp lệ: ${Object.keys(DEFAULTS).join(', ')})`,
      );
    }
    const value = Number(match[2].replaceAll('_', ''));
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Giá trị không hợp lệ: ${arg}`);
    overrides[match[1]] = value;
  }
  return { overrides, json };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { overrides, json } = parseArgs(process.argv.slice(2));
    const model = computeModel(overrides);
    console.log(json ? JSON.stringify(model, null, 2) : renderReport(model));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
