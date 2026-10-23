import assert from 'node:assert/strict';
import { test } from 'node:test';

import { simulate } from './matching-hol-sim.mjs';

test('tất định: cùng seed cho cùng kết quả', () => {
  const first = simulate({ window: 8, lambda: 2, seconds: 600 });
  const second = simulate({ window: 8, lambda: 2, seconds: 600 });
  assert.deepEqual(first, second);
});

test('cửa sổ 2 (bản cũ) bị kẹt đầu hàng đợi: ghép ít hơn hẳn và hết hạn nhiều hơn cửa sổ 32', () => {
  const old = simulate({ window: 2, lambda: 2 });
  const wide = simulate({ window: 32, lambda: 2 });
  assert.ok(old.matchedPct < 60, `matched ${old.matchedPct}`);
  assert.ok(wide.matchedPct > 95, `matched ${wide.matchedPct}`);
  assert.ok(old.expiredPct > 30);
  assert.ok(wide.expiredPct < 5);
  assert.ok(wide.p95WaitSeconds < old.p95WaitSeconds);
});

test('cửa sổ rộng hơn không bao giờ ghép ít hơn (đơn điệu) và không vượt mức lý tưởng', () => {
  const ideal = simulate({ window: 0, lambda: 2, unlimitedWindow: true });
  let previous = -1;
  for (const window of [2, 4, 8, 16, 32]) {
    const result = simulate({ window, lambda: 2 });
    assert.ok(result.matchedPct >= previous, `window ${window}`);
    assert.ok(result.matchedPct <= ideal.matchedPct + 0.5);
    previous = result.matchedPct;
  }
});

test('quần thể toàn preference "any" thì cửa sổ 2 đã đủ (không có kẹt)', () => {
  const result = simulate({ window: 2, lambda: 2, pAny: 1, pOpposite: 0 });
  assert.ok(result.matchedPct > 99);
});
