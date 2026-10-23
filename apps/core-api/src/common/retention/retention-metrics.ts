import type { Counter, Gauge, Meter } from '@opentelemetry/api';

import type { PurgeResult } from './batched-purge';

interface RetentionInstruments {
  deleted: Counter;
  eligible: Gauge;
}

const instruments = new WeakMap<Meter, RetentionInstruments>();

function instrumentsOf(meter: Meter): RetentionInstruments {
  let existing = instruments.get(meter);
  if (existing === undefined) {
    existing = {
      deleted: meter.createCounter('retention_rows_total', {
        description:
          'Số hàng đã xoá bởi job retention (mode=delete), theo quy tắc',
      }),
      eligible: meter.createGauge('retention_eligible_rows', {
        description:
          'Số hàng đủ điều kiện xoá ở lần dry-run gần nhất, theo quy tắc (chặn trên bởi lô × số lô/tick; ' +
          'bằng đúng trần nghĩa là còn nhiều hơn). Gauge — không cộng dồn qua các tick',
      }),
    };
    instruments.set(meter, existing);
  }
  return existing;
}

/**
 * Dùng chung cho mọi job retention của các module (ADR 0013): `retention_rows_total{rule}` là counter số hàng
 * ĐÃ XOÁ; `retention_eligible_rows{rule}` là gauge số hàng ĐỦ ĐIỀU KIỆN ở lần dry-run gần nhất (counter sẽ
 * cộng dồn lại cùng một backlog mỗi tick nên không dùng cho dry-run). Best-effort: lỗi ghi metric không được
 * phá job.
 */
export function recordRetention(meter: Meter, result: PurgeResult): void {
  try {
    const { deleted, eligible } = instrumentsOf(meter);
    if (result.mode === 'delete') {
      deleted.add(result.rows, { rule: result.label });
    } else {
      eligible.record(result.rows, { rule: result.label });
    }
  } catch {
    // metric không phải đường nghiệp vụ
  }
}
