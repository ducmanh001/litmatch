import type { DataSource } from 'typeorm';

/**
 * Chế độ retention (ADR 0013): `off` không chạy job; `dry-run` chỉ đếm số hàng đủ điều kiện để chủ hệ
 * thống xem tác động trước khi xoá; `delete` xoá thật.
 */
export type RetentionMode = 'off' | 'dry-run' | 'delete';

export interface PurgeStep {
  /** Nhãn cho log/metric, dạng `bảng:quy_tắc`. Cố định trong mã, không lấy từ input. */
  label: string;
  table: string;
  /** Cột khoá chính dùng để nối DELETE với lô đã chọn. */
  primaryKey: string;
  /**
   * Điều kiện SQL tĩnh (viết trong mã, KHÔNG nội suy input) chọn hàng đủ điều kiện xoá. Tham số bind
   * bắt đầu từ `$2` (`$1` dành cho kích thước lô).
   */
  predicate: string;
  params: readonly unknown[];
  /** Thứ tự xoá (cột đã có index) để lô sau tiếp tục từ hàng cũ nhất; bỏ trống = thứ tự tuỳ ý. */
  orderBy?: string;
}

export interface PurgeOptions {
  mode: Exclude<RetentionMode, 'off'>;
  batchSize: number;
  maxBatches: number;
  /** Nghỉ giữa các lô để vacuum/replica theo kịp. */
  pauseMs: number;
  /** Mốc (epoch ms) sau đó không bắt đầu lô mới — chặn tick chạy quá lâu giữ kết nối/transaction của runner. */
  deadlineAt?: number;
  /** Trả true khi cần dừng sớm (shutdown); kiểm tra giữa các lô. */
  shouldStop?: () => boolean;
}

export interface PurgeResult {
  label: string;
  mode: PurgeOptions['mode'];
  /** `delete`: số hàng đã xoá; `dry-run`: số hàng đủ điều kiện (chặn trên bởi batchSize × maxBatches). */
  rows: number;
  batches: number;
  /** Còn hàng chưa xử lý (tick sau tiếp tục). */
  capped: boolean;
}

function assertIdentifier(value: string, what: string): void {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Retention ${what} không hợp lệ: ${value}`);
  }
}

/** Chọn lô rồi xoá trong MỘT câu lệnh: `SKIP LOCKED` để không chặn/đợi writer đang chạm cùng hàng. */
export function buildDeleteSql(step: PurgeStep): string {
  assertIdentifier(step.table, 'table');
  assertIdentifier(step.primaryKey, 'primary key');
  const order = step.orderBy === undefined ? '' : `ORDER BY ${step.orderBy}`;
  return `
    WITH doomed AS MATERIALIZED (
      SELECT ${step.primaryKey} FROM ${step.table}
       WHERE ${step.predicate}
       ${order}
       LIMIT $1
       FOR UPDATE SKIP LOCKED
    ), removed AS (
      DELETE FROM ${step.table} t
       USING doomed d
       WHERE t.${step.primaryKey} = d.${step.primaryKey}
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM removed`;
}

/** Đếm có chặn trên (không quét cả bảng khi backlog khổng lồ). */
export function buildCountSql(step: PurgeStep): string {
  assertIdentifier(step.table, 'table');
  return `
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM ${step.table}
       WHERE ${step.predicate}
       LIMIT $1
    ) eligible`;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Xoá theo lô có trần mỗi tick. Mỗi lô là một câu lệnh ngắn tự commit (không giữ transaction dài và
 * không giữ khoá hàng lâu); kết thúc khi hết hàng hoặc chạm `maxBatches` — phần còn lại để tick sau.
 */
export async function purgeInBatches(
  dataSource: Pick<DataSource, 'query'>,
  step: PurgeStep,
  options: PurgeOptions,
): Promise<PurgeResult> {
  if (options.mode === 'dry-run') {
    const cap = options.batchSize * options.maxBatches;
    const [row] = (await dataSource.query(buildCountSql(step), [
      cap,
      ...step.params,
    ])) as Array<{ n: number }>;
    const rows = row?.n ?? 0;
    return {
      label: step.label,
      mode: 'dry-run',
      rows,
      batches: 0,
      capped: rows >= cap,
    };
  }

  const sql = buildDeleteSql(step);
  let rows = 0;
  let batches = 0;
  let lastFull = false;
  while (batches < options.maxBatches) {
    const [row] = (await dataSource.query(sql, [
      options.batchSize,
      ...step.params,
    ])) as Array<{ n: number }>;
    const removed = row?.n ?? 0;
    batches += 1;
    rows += removed;
    lastFull = removed >= options.batchSize;
    if (!lastFull) break;
    if (options.shouldStop?.() === true) break;
    if (options.pauseMs > 0 && batches < options.maxBatches) {
      await sleep(options.pauseMs);
    }
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      break;
    }
  }
  return {
    label: step.label,
    mode: 'delete',
    rows,
    batches,
    capped: lastFull,
  };
}
