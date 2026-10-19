import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RETENTION_DEFAULT_ROWS_PER_SEC,
  SCENARIO,
  computeDataGrowth,
  renderReport,
} from './data-growth.mjs';

const script = fileURLToPath(new URL('./data-growth.mjs', import.meta.url));

test('mọi bảng của mô hình đều có byte/hàng ĐO (không có số tự đặt)', () => {
  const model = computeDataGrowth();
  assert.ok(model.tables.length >= 20);
  for (const table of model.tables) {
    assert.ok(table.bytesPerRow > 100, `${table.table} byte/hàng`);
    assert.ok(table.bytesPerRow < 1000, `${table.table} byte/hàng`);
  }
});

test('kịch bản mặc định: refresh_tokens là bảng tăng nhanh nhất; DAU suy ra từ CCU', () => {
  const model = computeDataGrowth();
  assert.equal(model.tables[0].table, 'refresh_tokens');
  // 10 triệu CCU × 0,3 × 24 ÷ 1,5 giờ = 48 triệu DAU
  assert.equal(model.dau, 48_000_000);
  // 7 lần xoay/DAU/ngày: 1 đăng nhập + 1,5 giờ × 60 ÷ 15 phút
  assert.equal(model.tables[0].rowsPerDay, 48_000_000 * 7);
});

test('có vòng đời thì trạng thái ổn định nhỏ hơn tăng trưởng không dọn; không vòng đời (sổ cái) thì bằng nhau sau N năm', () => {
  const model = computeDataGrowth({}, 3);
  for (const table of model.tables) {
    if (table.retentionDays === null) {
      assert.ok(
        Math.abs(table.tbWithPolicy - table.tbAfterYearsNoRetention) < 1e-9,
        table.table,
      );
    } else {
      assert.ok(
        table.tbWithPolicy <= table.tbAfterYearsNoRetention,
        table.table,
      );
    }
  }
  assert.ok(
    model.totals.tbWithPolicy < model.totals.tbAfterYearsNoRetention / 5,
  );
});

test('sổ cái (transactions, ledger_entries) không bao giờ có vòng đời xoá', () => {
  const model = computeDataGrowth();
  for (const name of ['transactions', 'ledger_entries', 'gift_events']) {
    const table = model.tables.find((t) => t.table === name);
    assert.equal(table.retentionDays, null, name);
    assert.equal(table.deletesPerSecAvg, 0, name);
  }
});

test('bảng cần xoá nhanh hơn một nửa công suất mặc định được cảnh báo', () => {
  const model = computeDataGrowth();
  const report = renderReport(model);
  const heavy = model.tables
    .filter((t) => t.deletesPerSecAvg > 0.5 * RETENTION_DEFAULT_ROWS_PER_SEC)
    .map((t) => t.table);
  assert.ok(heavy.includes('refresh_tokens'));
  for (const name of heavy) assert.match(report, new RegExp(name));
  assert.match(report, /CẢNH BÁO/);
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
