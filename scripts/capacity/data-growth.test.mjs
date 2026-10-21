import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RETENTION_DEFAULT_ROWS_PER_SEC,
  SCENARIO,
  STORY_SWEEPER,
  blendedRotatedRetentionDays,
  computeDataGrowth,
  renderReport,
  sweeperAdequacy,
} from './data-growth.mjs';

const script = fileURLToPath(new URL('./data-growth.mjs', import.meta.url));
const table = (model, name) => model.tables.find((t) => t.table === name);

test('slow batches, shared rule budgets and skipped admission reduce effective purge throughput and grow backlog', () => {
  const baseline = computeDataGrowth();
  const constrained = computeDataGrowth({
    retentionBatchLatencyMs: 1_000,
    retentionAdmissionFraction: 0.5,
    retentionRuleBudgetFraction: 0.5,
  });
  assert.equal(constrained.retentionCapacity.effectiveBatchesPerTick, 14);
  assert.ok(constrained.retentionCapacity.rowsPerSecondPerRule < 600);
  assert.ok(
    table(constrained, 'refresh_tokens').tbAfterYearsDefault >
      table(baseline, 'refresh_tokens').tbAfterYearsDefault,
  );
  assert.match(renderReport(constrained), /độ trễ lô do caller cung cấp/);
  assert.match(renderReport(baseline), /trần lạc quan/);
});

test('no admitted ticks retains every eligible row and warns without non-finite JSON values', () => {
  const model = computeDataGrowth({ retentionAdmissionFraction: 0 });
  const refresh = table(model, 'refresh_tokens');
  assert.equal(refresh.tbAfterYearsDefault, refresh.tbAfterYearsNoRetention);
  assert.equal(refresh.noPurgeCapacity, true);
  assert.equal(refresh.capacityRatio, null);
  assert.equal(model.retentionCapacity.rowsPerSecondPerRule, 0);
  assert.match(renderReport(model), /không có công suất dọn/);
  assert.equal(
    JSON.parse(JSON.stringify(model)).tables[0].noPurgeCapacity,
    true,
  );
});

test('retention timing and share inputs reject invalid capacity assumptions', () => {
  for (const values of [
    { retentionAdmissionFraction: 1.1 },
    { retentionRuleBudgetFraction: -1 },
    { retentionBatchLatencyMs: -10 },
    { retentionTickBudgetSeconds: Infinity },
    { retentionBatchPauseMs: NaN },
    { retentionIntervalSeconds: 0 },
    { retentionMaxBatchesPerTick: 0.5 },
  ])
    assert.throws(() => computeDataGrowth(values), /must be/);
});

test('zero rule budget means no purge even with zero batch and pause latency', () => {
  const model = computeDataGrowth({
    retentionRuleBudgetFraction: 0,
    retentionBatchLatencyMs: 0,
    retentionBatchPauseMs: 0,
  });
  assert.equal(model.retentionCapacity.rowsPerSecondPerRule, 0);
  assert.equal(table(model, 'refresh_tokens').noPurgeCapacity, true);
});

test('mọi bảng của mô hình đều có byte/hàng ĐO (không có số tự đặt)', () => {
  const model = computeDataGrowth();
  assert.ok(model.tables.length >= 20);
  for (const t of model.tables) {
    assert.ok(t.bytesPerRow > 100, `${t.table} byte/hàng`);
    assert.ok(t.bytesPerRow < 1000, `${t.table} byte/hàng`);
  }
});

test('kịch bản mặc định: refresh_tokens là bảng tăng nhanh nhất; DAU suy ra từ CCU', () => {
  const model = computeDataGrowth();
  assert.equal(model.tables[0].table, 'refresh_tokens');
  // 10 triệu CCU × 0,3 × 24 ÷ 1,5 giờ = 48 triệu DAU
  assert.equal(model.dau, 48_000_000);
  // 6 lần xoay/DAU/ngày (1,5 giờ × 60 ÷ 15 phút) + 1 đăng nhập mới mỗi 30 ngày mỗi DAU
  assert.ok(
    Math.abs(model.tables[0].rowsPerDay - 48_000_000 * (6 + 1 / 30)) < 1,
  );
});

test('tổng là dung lượng bảng tại năm N: không dọn ≥ mặc định ≥ khuyến nghị; sổ cái bằng nhau ở cả ba', () => {
  const model = computeDataGrowth({}, 3);
  for (const t of model.tables) {
    assert.ok(
      t.tbAfterYearsDefault <= t.tbAfterYearsNoRetention + 1e-9,
      t.table,
    );
    assert.ok(
      t.tbAfterYearsRecommended <= t.tbAfterYearsDefault + 1e-9,
      t.table,
    );
    if (t.retentionDays === null && t.decision === undefined) {
      // Không có vòng đời và không có khuyến nghị xoá (sổ cái, nội dung người dùng): ba cột bằng nhau.
      assert.ok(
        Math.abs(t.tbAfterYearsDefault - t.tbAfterYearsNoRetention) < 1e-9,
        t.table,
      );
      assert.ok(
        Math.abs(t.tbAfterYearsRecommended - t.tbAfterYearsNoRetention) < 1e-9,
        t.table,
      );
    }
  }
  const totals = model.totals;
  assert.ok(totals.tbAfterYearsDefault <= totals.tbAfterYearsNoRetention);
  assert.ok(totals.tbAfterYearsRecommended < totals.tbAfterYearsDefault);
  // Chỉ nhận mọi khuyến nghị mới đưa dung lượng xuống dưới một phần năm của tăng trưởng không dọn.
  assert.ok(
    totals.tbAfterYearsRecommended < totals.tbAfterYearsNoRetention / 5,
  );
  // Phần "giữ vĩnh viễn" vẫn tăng mãi, và nhiều hơn khi chưa chấp nhận khuyến nghị.
  assert.ok(totals.tbPerYearStillGrowingRecommended > 0);
  assert.ok(
    totals.tbPerYearStillGrowingDefault >
      totals.tbPerYearStillGrowingRecommended,
  );
});

test('công suất xoá mặc định đủ cho refresh_tokens (< 1×); với mặc định CŨ (20 lô) thì vào gấp ~2× công suất và backlog làm phình bảng', () => {
  const model = computeDataGrowth();
  const refresh = table(model, 'refresh_tokens');
  // 5.000 × 60 / 60 s = 432 triệu hàng/ngày/quy tắc; refresh_tokens vào ~289,6 triệu/ngày
  assert.ok(refresh.capacityRatio > 0.6 && refresh.capacityRatio < 0.75);
  assert.ok(
    Math.abs(refresh.tbAfterYearsDefault - refresh.tbAfterYearsDefaultTuned) <
      1e-9,
  );
  assert.ok(
    model.totals.tbAfterYearsDefaultTuned >=
      model.totals.tbAfterYearsRecommended,
  );
  // mặc định cũ (20 lô = 144 triệu/ngày): không theo kịp, backlog tích lại
  const old = computeDataGrowth({ retentionMaxBatchesPerTick: 20 });
  const oldRefresh = table(old, 'refresh_tokens');
  assert.ok(oldRefresh.capacityRatio > 1.9 && oldRefresh.capacityRatio < 2.1);
  assert.ok(
    oldRefresh.tbAfterYearsDefault > oldRefresh.tbAfterYearsDefaultTuned * 5,
  );
  assert.ok(
    old.totals.tbAfterYearsDefault > old.totals.tbAfterYearsDefaultTuned,
  );
  assert.match(renderReport(old), /refresh_tokens 2.0×/u);
  // bảng không do job xoá (sweeper, phân vùng) không bị tính công suất job
  assert.equal(table(model, 'story_views').capacityRatio, 0);
});

test('vòng đời mặc định phản ánh đúng mã: mục CẦN QUYẾT ĐỊNH để mặc định TẮT', () => {
  const model = computeDataGrowth();
  // job xoá token theo expires_at + GRACE: mọi hàng sống TTL + GRACE ngày, KHÔNG phải 7 ngày
  assert.equal(
    table(model, 'refresh_tokens').retentionDays,
    SCENARIO.refreshTtlDays + SCENARIO.refreshGraceDays,
  );
  assert.ok(
    table(model, 'refresh_tokens').decision.recommendedDays <
      table(model, 'refresh_tokens').retentionDays,
  );
  // VIDEO_VIEW_RETENTION_DAYS mặc định 0; relay outbox tắt ở mọi profile → job không có gì để xoá
  for (const name of ['video_views', 'outbox_events']) {
    assert.equal(table(model, name).retentionDays, null, name);
    assert.ok(table(model, name).decision.recommendedDays > 0, name);
  }
  // đã có cơ chế chạy mặc định
  for (const name of [
    'phone_otps',
    'match_daily_quotas',
    'guest_match_quotas',
    'mood_status_events',
    'notifications',
    'story_views',
  ]) {
    assert.ok(table(model, name).retentionDays > 0, name);
    assert.equal(table(model, name).decision, undefined, name);
  }
});

test('sổ cái (transactions, ledger_entries, gift_events) không bao giờ có vòng đời xoá hay khuyến nghị xoá', () => {
  const model = computeDataGrowth();
  for (const name of ['transactions', 'ledger_entries', 'gift_events']) {
    const t = table(model, name);
    assert.equal(t.retentionDays, null, name);
    assert.equal(t.decision, undefined, name);
    assert.equal(t.recommendedDays, null, name);
    assert.equal(t.deletesPerSecAvg, 0, name);
  }
});

test('dọn-lúc-xoay refresh token chỉ có lợi khi họ sống lâu: L=1 → bằng TTL+GRACE, L lớn → tiệm cận N', () => {
  const base = { rotatedDays: 7, fullDays: 37 };
  assert.equal(
    blendedRotatedRetentionDays({ ...base, familyActiveDays: 1 }),
    37,
  );
  assert.equal(
    blendedRotatedRetentionDays({ ...base, familyActiveDays: 7 }),
    37,
  );
  // 23 ngày × 7 + 7 ngày × 37 chia cho 30
  assert.ok(
    Math.abs(
      blendedRotatedRetentionDays({ ...base, familyActiveDays: 30 }) - 14,
    ) < 1e-9,
  );
  const long = blendedRotatedRetentionDays({ ...base, familyActiveDays: 3650 });
  assert.ok(long > 7 && long < 7.1);
  let previous = Infinity;
  for (const days of [1, 7, 14, 30, 90, 365, 3650]) {
    const value = blendedRotatedRetentionDays({
      ...base,
      familyActiveDays: days,
    });
    assert.ok(value <= previous, `L=${days}`);
    previous = value;
  }
});

test('khoá quota khách: mỗi khách ghi tới 3 hàng (user, device, network)', () => {
  const model = computeDataGrowth();
  const matchingUsers =
    (SCENARIO.matchesPerDay * 2) / SCENARIO.matchesPerMatchingUserPerDay;
  assert.ok(
    Math.abs(
      table(model, 'guest_match_quotas').rowsPerDay -
        matchingUsers * SCENARIO.guestShareOfMatchingUsers * 3,
    ) < 1,
  );
});

test('every scenario knob changes output in an applicable, valid workload', () => {
  // `inputs` lặp lại chính các knob nên PHẢI bỏ ra, nếu không mọi knob đều "đổi kết quả" và test vô nghĩa.
  const outputs = (overrides) =>
    JSON.stringify({ ...computeDataGrowth(overrides), inputs: undefined });
  const timingKeys = new Set([
    'retentionTickBudgetSeconds',
    'retentionBatchPauseMs',
    'retentionBatchLatencyMs',
    'retentionRuleBudgetFraction',
  ]);
  const dead = Object.entries(SCENARIO)
    .filter(([, value]) => typeof value === 'number')
    .filter(([key, value]) => {
      // Timing knobs matter when the deadline binds; fractions must remain within [0, 1].
      const context = timingKeys.has(key)
        ? { retentionBatchLatencyMs: 1_000 }
        : {};
      const current = context[key] ?? value;
      const changed = key.endsWith('Fraction')
        ? current / 2
        : current === 0
          ? 0.1
          : current * 2;
      return outputs({ ...context, [key]: changed }) === outputs(context);
    })
    .map(([key]) => key);
  assert.deepEqual(dead, []);
});

test('bảng cần xoá nhanh hơn một nửa công suất mặc định (và do job retention xoá) được cảnh báo', () => {
  const model = computeDataGrowth();
  const report = renderReport(model);
  const heavy = model.tables
    .filter(
      (t) =>
        t.deleteVia === 'job' &&
        t.deletesPerSecAvg > 0.5 * RETENTION_DEFAULT_ROWS_PER_SEC,
    )
    .map((t) => t.table);
  assert.ok(heavy.includes('refresh_tokens'));
  assert.match(report, /CẢNH BÁO: [^\n]*refresh_tokens/);
  for (const name of heavy) assert.match(report, new RegExp(name));
  // story_views do sweeper xoá (không chịu RETENTION_*) nên không nằm trong cảnh báo công suất của job retention
  assert.doesNotMatch(report, /CẢNH BÁO: [^\n]*story_views/);
});

test('story sweeper: công suất ở chu kỳ mặc định có biên an toàn ở lab nhưng KHÔNG được coi là chứng minh ở quy mô lớn', () => {
  const model = computeDataGrowth();
  const sweeper = model.sweeper;
  // 96 triệu lượt xem/ngày ÷ 100 lượt/story = 960.000 story = 1.920 lô; 24 tick/ngày → 80 lô/tick
  assert.equal(sweeper.batchesNeededPerDay, 1920);
  assert.equal(sweeper.batchesPerTickNeeded, 80);
  // 30.000 ms ÷ 80 lô − 50 ms nghỉ
  assert.equal(sweeper.maxBatchMsForDefaultInterval, 325);
  assert.ok(sweeper.headroomAtLab > 3 && sweeper.headroomAtLab < 5);
  // lô chậm hơn thì chu kỳ phải ngắn hơn
  assert.ok(sweeper.maxIntervalMsAtLab > sweeper.maxIntervalMsAt5xSlower);
  assert.ok(sweeper.maxIntervalMsAt5xSlower > sweeper.maxIntervalMsAt10xSlower);
  // ở 10× chậm hơn lab, chu kỳ mặc định 1 giờ KHÔNG còn đủ
  assert.ok(sweeper.maxIntervalMsAt10xSlower < STORY_SWEEPER.defaultIntervalMs);

  const report = renderReport(model);
  assert.match(report, /Story sweeper/);
  assert.match(report, /STORY_SWEEPER_INTERVAL_MS/);
  // tải gấp đôi thì cần nhiều lô hơn
  const doubled = sweeperAdequacy(SCENARIO, 2 * 96_000_000);
  assert.equal(doubled.batchesNeededPerDay, 3840);
});

test('kịch bản nhỏ hơn thì mọi tổng nhỏ đi và không còn cảnh báo công suất xoá', () => {
  const small = computeDataGrowth({
    ccu: 100_000,
    matchesPerDay: 100_000,
    chatters: 100,
    partyAndMovieMessagesPerDay: 20_000,
  });
  const big = computeDataGrowth();
  assert.ok(
    small.totals.tbPerYearNoRetention < big.totals.tbPerYearNoRetention / 50,
  );
  assert.doesNotMatch(renderReport(small), /CẢNH BÁO/);
});

test('báo cáo gọi đúng tên số đo (dung lượng tại năm N, không phải "ổn định") và nêu phần còn tăng', () => {
  const report = renderReport(computeDataGrowth());
  assert.match(report, /TiB sau 3n/);
  assert.match(report, /profile dry-run, story sweeper chạy kịp/);
  assert.match(report, /vòng đời MẶC ĐỊNH của mã/);
  assert.match(report, /nếu chấp nhận MỌI khuyến nghị/);
  assert.match(report, /còn tăng/);
  assert.doesNotMatch(report, /ổn định/);
});

test('dry-run keeps retention-managed rows but the independent story sweeper still bounds story views', () => {
  const model = computeDataGrowth();
  const views = table(model, 'story_views');
  assert.equal(
    model.totals.tbAfterYearsDryRun,
    model.totals.tbAfterYearsNoRetention -
      views.tbAfterYearsNoRetention +
      views.tbAfterYearsDefault,
  );
  assert.ok(model.totals.tbAfterYearsDryRun > model.totals.tbAfterYearsDefault);
  assert.ok(
    model.totals.tbAfterYearsDryRun < model.totals.tbAfterYearsNoRetention,
  );
});

test('annual traffic compounds across years while retained hot history follows the final-year traffic', () => {
  const firstYear = computeDataGrowth({}, 1);
  const flat = computeDataGrowth({}, 3);
  const growing = computeDataGrowth({ annualGrowthRate: 0.3 }, 3);
  const expectedTotal =
    firstYear.totals.tbAfterYearsNoRetention * (1 + 1.3 + 1.69);
  assert.ok(
    Math.abs(growing.totals.tbAfterYearsNoRetention - expectedTotal) < 1e-8,
  );
  assert.ok(
    Math.abs(
      table(growing, 'messages').tbAfterYearsRecommended -
        table(flat, 'messages').tbAfterYearsRecommended * 1.69,
    ) < 1e-8,
  );
  assert.ok(
    growing.totals.tbAfterYearsDefault >=
      growing.totals.tbAfterYearsDefaultTuned,
  );
});

test('retention backlog drains after traffic falls below purge capacity', () => {
  const forecast = computeDataGrowth(
    {
      ccu: 1000,
      annualGrowthRate: -0.9,
      retentionBatchSize: 10_000,
      retentionMaxBatchesPerTick: 1,
      retentionIntervalSeconds: 86_400,
    },
    8,
  );
  const tokens = table(forecast, 'refresh_tokens');
  assert.ok(
    Math.abs(tokens.tbAfterYearsDefault - tokens.tbAfterYearsDefaultTuned) <
      1e-8,
  );
});

test('forecast rejects invalid horizons and unbounded annual growth', () => {
  for (const years of [0, -1, 1.5, 101, NaN, Infinity]) {
    assert.throws(() => computeDataGrowth({}, years), /years/);
  }
  for (const annualGrowthRate of [-1, -2, NaN, Infinity, 11]) {
    assert.throws(
      () => computeDataGrowth({ annualGrowthRate }),
      /annualGrowthRate/,
    );
  }
});

test('CLI --json in mô hình hợp lệ; tham số lạ bị từ chối', () => {
  const ok = spawnSync(process.execPath, [script, '--json', '--years=2'], {
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0, ok.stderr);
  const parsed = JSON.parse(ok.stdout);
  assert.equal(parsed.inputs.years, 2);
  assert.equal(parsed.inputs.ccu, SCENARIO.ccu);

  const bad = spawnSync(process.execPath, [script, '--khong-biet=1'], {
    encoding: 'utf8',
  });
  assert.notEqual(bad.status, 0);
});
