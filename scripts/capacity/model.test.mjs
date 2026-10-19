import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULTS, computeModel, renderReport } from './model.mjs';

const script = fileURLToPath(new URL('./model.mjs', import.meta.url));

test('kịch bản mặc định: 10 triệu CCU cần 220 pod gateway và lease là chi phí Redis chính', () => {
  const model = computeModel();
  assert.equal(model.realtime.gatewayPods, 220);
  assert.equal(model.realtime.leaseRefreshSeconds, 30);
  assert.equal(
    model.realtime.leaseOpsPerSec,
    Math.round((10_000_000 * 1.1) / 30),
  );
  // Sau cải tiến, pub/sub gần như không đáng kể so với gia hạn lease.
  assert.ok(
    model.realtime.redisCores.pubsubPerUser <
      model.realtime.redisCores.leaseAfter / 10,
  );
});

test('subscribe theo user + gộp lô luôn cần ít shard hơn PSUBSCRIBE + EVAL từng socket', () => {
  for (const ccu of [100_000, 1_000_000, 10_000_000]) {
    const { realtime } = computeModel({ ccu });
    assert.ok(
      realtime.redisShardsAfter <= realtime.redisShardsBefore,
      `ccu=${ccu}`,
    );
  }
  const big = computeModel({ ccu: 10_000_000 }).realtime;
  assert.ok(big.redisShardsAfter < big.redisShardsBefore);
});

test('chi phí PSUBSCRIBE tăng theo số pod còn SUBSCRIBE theo user thì không', () => {
  const small = computeModel({ ccu: 500_000 }).realtime;
  const large = computeModel({ ccu: 10_000_000 }).realtime;
  assert.ok(
    large.pubsubMicrosPerEventPattern > small.pubsubMicrosPerEventPattern,
  );
  assert.equal(DEFAULTS.pubsubUsPerUserSubscribe, 5);
});

test('kéo dài lease giảm số lệnh gia hạn đúng tỉ lệ', () => {
  const base = computeModel().realtime;
  const longer = computeModel({ leaseMs: 270_000 }).realtime; // refresh 90s thay vì 30s
  assert.equal(longer.leaseRefreshSeconds, 90);
  assert.ok(Math.abs(longer.leaseOpsPerSec * 3 - base.leaseOpsPerSec) <= 3);
  assert.ok(longer.redisShardsAfter < base.redisShardsAfter);
});

test('tải giảm một nửa thì lệnh gia hạn giảm một nửa và số shard không tăng', () => {
  const full = computeModel().realtime;
  const half = computeModel({ ccu: 5_000_000 }).realtime;
  assert.ok(Math.abs(half.leaseOpsPerSec * 2 - full.leaseOpsPerSec) <= 2);
  assert.ok(half.redisShardsAfter <= full.redisShardsAfter);
});

test('ghép đôi: cặp/giây cao điểm = trung bình × hệ số đỉnh; voice dùng định luật Little', () => {
  const { matching, media } = computeModel({
    matchesPerDay: 8_640_000,
    matchPeakFactor: 5,
    voiceShare: 1,
    avgCallSeconds: 100,
  });
  assert.equal(matching.pairsPerSecAvg, 100);
  assert.equal(matching.pairsPerSecPeak, 500);
  assert.equal(media.concurrentCallsAtPeak, 50_000); // 500 cặp/giây × 100 giây
  assert.equal(media.concurrentParticipants, 100_000);
});

test('streak đường nhanh và canPair một truy vấn giảm câu lệnh Postgres, không làm tăng', () => {
  const { postgres } = computeModel();
  assert.ok(postgres.stmtsPerSecAfter < postgres.stmtsPerSecBefore);
  // Không còn chat bạn bè và không còn ghép đôi: chỉ còn chat ẩn danh, không đổi giữa trước/sau.
  const noFriendChat = computeModel({
    friendChatShare: 0,
    matchesPerDay: 0,
  }).postgres;
  assert.equal(noFriendChat.stmtsPerSecAfter, noFriendChat.stmtsPerSecBefore);
});

test('cổng gộp thông báo: bật cửa sổ giảm ≥80% insert notification ở tải chat đề bài; tắt (0) thì bằng trước', () => {
  const on = computeModel();
  assert.ok(on.chat.friendNotificationReductionPct >= 80);
  assert.ok(
    on.chat.friendNotificationInsertsPerSecAfter <
      on.chat.friendNotificationInsertsPerSecBefore / 5,
  );

  const off = computeModel({ friendNotifyWindowSeconds: 0 });
  assert.equal(off.chat.friendNotificationReductionPct, 0);
  assert.equal(
    off.chat.friendNotificationInsertsPerSecAfter,
    off.chat.friendNotificationInsertsPerSecBefore,
  );
  // Gộp thông báo làm giảm thêm câu lệnh Postgres so với chỉ có đường nhanh streak.
  assert.ok(on.postgres.stmtsPerSecAfter < off.postgres.stmtsPerSecAfter);

  // Chat thưa (< 1 tin mỗi cửa sổ) thì cổng luôn mở — không có gì để gộp.
  const sparse = computeModel({ messagesPerChatterPerSec: 0.01 });
  assert.equal(sparse.chat.friendNotificationReductionPct, 0);
});

test('báo cáo nêu rõ đây không phải số đo và có đủ các mục', () => {
  const report = renderReport(computeModel());
  for (const heading of [
    'Mặt phẳng realtime',
    'Ghép đôi',
    'Chat và dữ liệu',
    'API',
  ]) {
    assert.ok(report.includes(heading), heading);
  }
  assert.ok(report.includes('Không phải kết quả đo'));
});

test('CLI: --json và ghi đè tham số; tham số lạ thì thoát mã 1', () => {
  const ok = spawnSync(
    process.execPath,
    [script, '--json', '--ccu=1_000_000'],
    { encoding: 'utf8' },
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).inputs.ccu, 1_000_000);

  const bad = spawnSync(process.execPath, [script, '--khongTonTai=1'], {
    encoding: 'utf8',
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Tham số không hợp lệ/);
});
