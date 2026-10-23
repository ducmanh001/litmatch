/**
 * Phần dùng chung của các benchmark vòng đời dữ liệu (ADR 0014). Mỗi benchmark tạo một DB tạm TỪ DB MẪU đã chạy đủ
 * migration (index và ràng buộc thật), nạp hàng tổng hợp, đo, rồi xoá DB tạm. CHỈ chạy trên Postgres cục bộ/throwaway:
 * script tạo/xoá database và nạp hàng triệu hàng.
 */

import pg from 'pg';

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:55432';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DB_NAME = /^[a-z_][a-z0-9_]*$/u;

/**
 * Từ chối mọi host không phải cục bộ: benchmark nạp hàng triệu hàng và DROP DATABASE. Từ chối luôn query string: driver pg cho
 * `?host=...` GHI ĐÈ hostname của URL nên `postgres://u:p@127.0.0.1/db?host=prod.example.com` sẽ vượt qua kiểm tra hostname.
 */
export function assertLocalUrl(url) {
  const parsed = new URL(url);
  if (parsed.search !== '') {
    throw new Error(
      'URL benchmark không được có query string (?host=... ghi đè host thật mà guard không thấy)',
    );
  }
  const host = parsed.hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Benchmark chỉ chạy trên Postgres cục bộ/throwaway, không chạy trên host: ${host}`,
    );
  }
}

/**
 * Đọc `--khoá=giá trị`. `defaults` quyết định tập khoá hợp lệ và kiểu (số → Number). Luôn có `url` và `template`.
 * Tham số lạ bị từ chối để gõ sai tên không bị lặng lẽ bỏ qua.
 */
export function parseBenchArgs(argv, defaults = {}) {
  const args = {
    url: DEFAULT_URL,
    template: 'litmatch_e2e',
    ...defaults,
  };
  for (const raw of argv) {
    if (!raw.startsWith('--')) throw new Error(`Tham số không hợp lệ: ${raw}`);
    // Tách ở dấu '=' ĐẦU TIÊN: giá trị (vd URL có `?a=b`) được phép chứa '='.
    const separator = raw.indexOf('=');
    const key = separator < 0 ? raw.slice(2) : raw.slice(2, separator);
    const value = separator < 0 ? undefined : raw.slice(separator + 1);
    if (!(key in args)) throw new Error(`Tham số không biết: --${key}`);
    if (value === undefined) throw new Error(`Thiếu giá trị: --${key}=...`);
    args[key] = typeof args[key] === 'number' ? Number(value) : value;
    if (typeof args[key] === 'number' && !Number.isFinite(args[key])) {
      throw new Error(`Giá trị không phải số: --${key}=${value}`);
    }
  }
  assertLocalUrl(args.url);
  if (!DB_NAME.test(args.template)) {
    throw new Error(`Tên DB mẫu không hợp lệ: ${args.template}`);
  }
  return args;
}

function connectionString(url, database) {
  const target = new URL(url);
  target.pathname = `/${database}`;
  return target.toString();
}

/**
 * Tạo DB tạm từ `template`, chạy `run(client)` trên một kết nối riêng, luôn xoá DB tạm khi xong.
 * DB mẫu KHÔNG được có kết nối nào khác đang mở (yêu cầu của `CREATE DATABASE ... TEMPLATE`).
 */
export async function withThrowawayDatabase({ url, template, name }, run) {
  assertLocalUrl(url);
  if (!DB_NAME.test(name)) throw new Error(`Tên DB tạm không hợp lệ: ${name}`);
  const admin = new pg.Client({
    connectionString: connectionString(url, 'postgres'),
  });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${template}`);
  } finally {
    await admin.end();
  }
  const client = new pg.Client({
    connectionString: connectionString(url, name),
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
    const cleanup = new pg.Client({
      connectionString: connectionString(url, 'postgres'),
    });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${name}`);
    } finally {
      await cleanup.end();
    }
  }
}

/** VACUUM song song cần /dev/shm lớn hơn mặc định 64 MB của container: tắt worker song song cho ổn định. */
export async function disableParallelWorkers(client) {
  await client.query('SET max_parallel_workers_per_gather = 0');
  await client.query('SET max_parallel_maintenance_workers = 0');
}

/** Nạp nhanh: bỏ kiểm tra FK trong phiên nạp (không dựng cả cây bảng cha). KHÔNG dùng cho phiên đo xoá cascade. */
export async function skipForeignKeys(client) {
  await client.query('SET session_replication_role = replica');
}

export async function walBytesSince(client, startLsn) {
  const { rows } = await client.query(
    'SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) AS bytes',
    [startLsn],
  );
  return Number(rows[0].bytes);
}

export async function currentLsn(client) {
  return (await client.query('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
}

/** `EXPLAIN (ANALYZE, BUFFERS)` → { text, executionMs, buffers, plan: 'Seq Scan' | 'Bitmap Index Scan ...' | 'Index Scan ...' }. */
export async function explainAnalyze(client, sql, params = []) {
  const { rows } = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${sql}`,
    params,
  );
  const text = rows.map((row) => row['QUERY PLAN']).join('\n');
  const executionMs = Number(/Execution Time: ([\d.]+) ms/u.exec(text)?.[1]);
  // Postgres bỏ bộ đếm bằng 0 (có thể chỉ in `read=N` hoặc `hit=N`).
  const line = /Buffers: shared([^\n]*)/u.exec(text)?.[1];
  const buffers =
    line === undefined
      ? Number.NaN
      : Number(/hit=(\d+)/u.exec(line)?.[1] ?? 0) +
        Number(/read=(\d+)/u.exec(line)?.[1] ?? 0);
  const plan = /Seq Scan/u.test(text)
    ? 'Seq Scan'
    : (/Bitmap Index Scan on \S+/u.exec(text)?.[0] ??
      /Index (?:Only )?Scan using \S+/u.exec(text)?.[0] ??
      '?');
  return { text, executionMs, buffers, plan };
}
