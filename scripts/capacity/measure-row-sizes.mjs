#!/usr/bin/env node
/**
 * Đo kích thước MỖI HÀNG (heap + toàn bộ index) của các bảng tăng nhanh, trên schema thật đã migrate.
 *
 *   pnpm capacity:row-sizes --url=postgres://postgres:postgres@127.0.0.1:55432 --template=litmatch_e2e
 *   pnpm capacity:row-sizes ... --rows=200000 --out=scripts/capacity/row-sizes.json
 *
 * Cách làm: tạo DB tạm từ DB mẫu (đã chạy mọi migration — kể cả index/ràng buộc thật), bỏ kiểm tra FK trong phiên
 * nạp (`session_replication_role = replica`), nạp N hàng tổng hợp cho từng bảng với độ dài chuỗi/JSON NGHIÊN
 * CỨU THEO DỮ LIỆU THẬT NHƯNG LÀ GIẢ ĐỊNH (ghi ngay trong từng spec), `VACUUM (ANALYZE)` rồi đọc
 * `pg_relation_size` / `pg_indexes_size`. Chỉ dùng DB tạm trên container throwaway.
 *
 * Giới hạn đã biết (đừng bỏ qua khi dùng số này):
 *   - Index B-tree sâu thêm theo log(N): số đo ở N=200k thấp hơn nhẹ so với 3 tỷ hàng (thường +5–10%);
 *   - UUID v4 ngẫu nhiên làm B-tree đầy ~70% (đã phản ánh vì PK/FK ở đây cũng là UUID ngẫu nhiên);
 *   - Chưa tính bloat do UPDATE/DELETE, WAL, replica và backup.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const DEFAULT_ROWS = 200_000;

const uuidOf = (expr) => `md5((${expr})::text)::uuid`;
const text = (length, salt = 't') =>
  `left(repeat(md5(g::text || '${salt}'), ${Math.ceil(length / 32)}), ${length})`;
const hex64 = (salt = 'h') =>
  `md5(g::text || '${salt}1') || md5(g::text || '${salt}2')`;
const uuidText = 'gen_random_uuid()::text';

/**
 * `ts` = mốc tăng dần theo g (chèn theo thời gian như production → B-tree theo created_at đầy ~90%).
 * Mỗi spec: cột nào không liệt kê sẽ lấy DEFAULT hoặc NULL; `assume` ghi giả định về dữ liệu.
 */
function specs(n) {
  const ts = `(now() - ((${n} - g) * interval '1 second'))`;
  const user = (mod = 5_000_000) => uuidOf(`g % ${mod}`);
  const json = (len) =>
    `jsonb_build_object('a', ${text(Math.floor(len / 2), 'ja')}, 'b', ${text(Math.floor(len / 2) - 20, 'jb')})`;
  return [
    {
      table: 'refresh_tokens',
      assume: 'mỗi lần xoay token sinh 1 hàng; hash 64 hex; 90% đã xoay',
      columns: {
        user_id: user(),
        token_hash: hex64(),
        family_id: uuidOf('g / 3'),
        expires_at: `${ts} + interval '30 days'`,
        rotated_at: `CASE WHEN g % 10 < 9 THEN ${ts} END`,
        created_at: ts,
      },
    },
    {
      table: 'phone_otps',
      assume: 'số điện thoại 12 ký tự; 70% đã dùng',
      columns: {
        phone: `'+84' || lpad((g % 1000000000)::text, 9, '0')`,
        code_hash: hex64(),
        expires_at: `${ts} + interval '5 minutes'`,
        consumed_at: `CASE WHEN g % 10 < 7 THEN ${ts} END`,
        created_at: ts,
      },
    },
    {
      table: 'messages',
      assume: 'tin chat bạn bè: content 80 ký tự, idempotency_key = UUID',
      columns: {
        conversation_id: uuidOf('g % 1000000'),
        sender_user_id: user(3_000_000),
        content: text(80),
        idempotency_key: uuidText,
        created_at: ts,
      },
    },
    {
      table: 'soul_chat_messages',
      assume: 'tin chat ẩn danh: content 60 ký tự, ~20 tin/phiên',
      columns: {
        session_id: uuidOf('g / 20'),
        sender_user_id: user(2_000_000),
        content: text(60),
        idempotency_key: uuidText,
        created_at: ts,
      },
    },
    {
      table: 'match_tickets',
      assume: 'idempotency_key ~73 ký tự (userId:key); 100% đã ghép',
      columns: {
        user_id: user(),
        match_type: `'voice'`,
        region: `'VN'`,
        age_band: '2',
        status: `'confirmed'`,
        enqueued_at: ts,
        session_id: uuidOf('g / 2'),
        idempotency_key: `${uuidText} || ':' || ${uuidText}`,
        created_at: ts,
        updated_at: ts,
      },
    },
    {
      table: 'match_sessions',
      assume: 'phiên đã xác nhận + kết thúc',
      columns: {
        match_type: `'voice'`,
        user_a_id: uuidOf('g * 2'),
        user_b_id: uuidOf('g * 2 + 1'),
        ticket_a_id: uuidOf('g * 2'),
        ticket_b_id: uuidOf('g * 2 + 1'),
        status: `'confirmed'`,
        confirmed_a_at: ts,
        confirmed_b_at: ts,
        ended_at: ts,
        created_at: ts,
        updated_at: ts,
      },
    },
    {
      table: 'notifications',
      assume: 'payload JSON ~200 byte; 60% đã đọc (sau cổng gộp 60 giây)',
      columns: {
        user_id: user(),
        type: `'friend_message'`,
        payload: `jsonb_build_object('conversationId', gen_random_uuid(), 'senderUserId', gen_random_uuid(), 'preview', ${text(40)})`,
        read_at: `CASE WHEN g % 10 < 6 THEN ${ts} END`,
        created_at: ts,
      },
    },
    {
      table: 'match_daily_quotas',
      assume: '1 hàng/(user, ngày, loại ghép)',
      columns: {
        user_id: uuidOf('g / 2'),
        quota_date: 'current_date',
        match_type: `CASE WHEN g % 2 = 0 THEN 'voice' ELSE 'soul' END`,
        count: '3',
        updated_at: ts,
      },
    },
    {
      table: 'guest_match_quotas',
      assume: '1 hàng/(khoá khách, ngày)',
      columns: {
        quota_date: 'current_date',
        key_hash: hex64(),
        count: '1',
        updated_at: ts,
      },
    },
    {
      table: 'outbox_events',
      assume: 'payload JSON ~220 byte; chưa publish (relay tắt ở K8s)',
      columns: {
        topic: `'litmatch.economy.events'`,
        event_type: `'economy.diamond.credited'`,
        payload: json(220),
        attempts: '0',
        created_at: ts,
      },
    },
    {
      table: 'transactions',
      assume:
        'idempotency_key ~80 ký tự; metadata JSON ~120 byte (SỔ CÁI — không xoá)',
      columns: {
        type: `'gift'`,
        status: `'completed'`,
        idempotency_key: `${uuidText} || ':' || ${uuidText} || ':x'`,
        request_hash: hex64(),
        actor_user_id: user(),
        metadata: json(120),
        created_at: ts,
      },
    },
    {
      table: 'ledger_entries',
      assume: 'SỔ CÁI — không xoá; ~2,2 entry/transaction',
      columns: {
        transaction_id: uuidOf('g / 2'),
        account_id: uuidOf('g % 6000000'),
        direction: `CASE WHEN g % 2 = 0 THEN 'debit' ELSE 'credit' END`,
        amount: '100 + (g % 900)',
        currency: `'DIA'`,
        created_at: ts,
      },
    },
    {
      table: 'video_views',
      assume: '1 hàng/(video, người xem) — UNIQUE, KHÔNG phải mỗi lượt xem',
      columns: {
        video_id: uuidOf('g % 200000'),
        viewer_id: uuidOf('g'),
        watch_time_ms: '6000',
        qualified: `(g % 3 = 0)`,
        created_at: ts,
      },
    },
    {
      table: 'video_reactions',
      assume: 'thích video — UNIQUE (video, user)',
      columns: {
        video_id: uuidOf('g % 200000'),
        user_id: uuidOf('g'),
        created_at: ts,
      },
    },
    {
      table: 'video_comments',
      assume: 'content 80 ký tự; chưa xoá mềm',
      columns: {
        video_id: uuidOf('g % 200000'),
        author_user_id: user(3_000_000),
        content: text(80),
        created_at: ts,
      },
    },
    {
      table: 'reactions',
      assume: 'thích bài feed — UNIQUE (post, user)',
      columns: {
        post_id: uuidOf('g % 200000'),
        user_id: uuidOf('g'),
        created_at: ts,
      },
    },
    {
      table: 'comments',
      assume: 'bình luận feed: content 80 ký tự',
      columns: {
        post_id: uuidOf('g % 200000'),
        author_user_id: user(3_000_000),
        content: text(80),
        created_at: ts,
      },
    },
    {
      table: 'call_sessions',
      assume: 'cuộc gọi voice đã kết thúc',
      columns: {
        id: 'gen_random_uuid()',
        match_session_id: uuidOf('g'),
        room_name: `'call-' || ${uuidText}`,
        user_a_id: uuidOf('g * 2'),
        user_b_id: uuidOf('g * 2 + 1'),
        status: `'ended'`,
        joined_a_at: ts,
        joined_b_at: ts,
        started_at: ts,
        ended_at: ts,
        end_reason: `'completed'`,
        duration_seconds: '300',
        billed_minutes: '5',
        created_at: ts,
        updated_at: ts,
        call_kind: `'voice_match'`,
      },
    },
    {
      table: 'soul_match_ratings',
      assume: '2 đánh giá/phiên',
      columns: {
        session_id: uuidOf('g / 2'),
        rater_user_id: uuidOf('g'),
        verdict: `'like'`,
        created_at: ts,
      },
    },
    {
      table: 'voice_match_reactions',
      assume: '1–2 phản ứng/cuộc gọi',
      columns: {
        call_id: uuidOf('g / 2'),
        rater_user_id: uuidOf('g'),
        created_at: ts,
      },
    },
    {
      table: 'story_views',
      assume: 'UNIQUE (story, viewer)',
      columns: {
        story_id: uuidOf('g % 100000'),
        viewer_id: uuidOf('g'),
        created_at: ts,
      },
    },
    {
      table: 'gift_events',
      assume: 'mỗi quà 1 hàng (gắn transaction sổ cái)',
      columns: {
        gift_id: uuidOf('g % 40'),
        room_id: uuidOf('g % 50000'),
        sender_user_id: uuidOf('g * 2'),
        receiver_user_id: uuidOf('g * 2 + 1'),
        price_diamond: '50',
        points_awarded: '25',
        points_rate_percent: '50',
        transaction_id: uuidOf('g'),
        created_at: ts,
      },
    },
    {
      table: 'party_room_comments',
      assume: 'content 60 ký tự',
      columns: {
        room_id: uuidOf('g % 50000'),
        sender_user_id: user(3_000_000),
        content: text(60),
        idempotency_key: uuidText,
        created_at: ts,
      },
    },
    {
      table: 'movie_session_messages',
      assume: 'content 60 ký tự',
      columns: {
        session_id: uuidOf('g / 20'),
        sender_user_id: user(3_000_000),
        content: text(60),
        idempotency_key: uuidText,
        created_at: ts,
      },
    },
    {
      table: 'mood_status_events',
      assume: 'idempotency_key = UUID',
      columns: {
        user_id: user(),
        preset_id: uuidOf('g % 20'),
        kind: `'set'`,
        expires_at: `${ts} + interval '24 hours'`,
        idempotency_key: uuidText,
        created_at: ts,
      },
    },
  ];
}

function parseArgs(argv) {
  const args = { rows: DEFAULT_ROWS, template: 'litmatch_e2e', keep: false };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/u, '').split('=');
    if (key === 'url') args.url = value;
    else if (key === 'template') args.template = value;
    else if (key === 'rows') args.rows = Number(value);
    else if (key === 'out') args.out = value;
    else if (key === 'keep') args.keep = true;
  }
  if (!args.url) {
    throw new Error(
      'Thiếu --url=postgres://user:pass@host:port (server Postgres throwaway, KHÔNG phải production)',
    );
  }
  return args;
}

const withDatabase = (url, database) => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};

export async function measureRowSizes({ url, template, rows, keep = false }) {
  const probeDb = 'lm_rowsize_probe';
  const admin = new pg.Client({
    connectionString: withDatabase(url, 'postgres'),
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${probeDb}`);
  await admin.query(`CREATE DATABASE ${probeDb} TEMPLATE ${template}`);
  const client = new pg.Client({
    connectionString: withDatabase(url, probeDb),
  });
  await client.connect();
  const results = [];
  try {
    await client.query('SET session_replication_role = replica');
    const [{ server_version: version }] = (
      await client.query('SHOW server_version')
    ).rows;
    for (const spec of specs(rows)) {
      const columns = Object.keys(spec.columns);
      try {
        await client.query(`TRUNCATE ${spec.table} RESTART IDENTITY CASCADE`);
        await client.query(
          `INSERT INTO ${spec.table} (${columns.join(', ')})
           SELECT ${columns.map((c) => spec.columns[c]).join(', ')}
             FROM generate_series(1, ${rows}) AS g`,
        );
        await client.query(`VACUUM (ANALYZE) ${spec.table}`);
        const {
          rows: [size],
        } = await client.query(
          `SELECT (SELECT count(*) FROM ${spec.table})::bigint AS n,
                  pg_relation_size('${spec.table}')::bigint AS heap,
                  pg_indexes_size('${spec.table}')::bigint AS indexes,
                  (pg_total_relation_size('${spec.table}')
                   - pg_relation_size('${spec.table}')
                   - pg_indexes_size('${spec.table}'))::bigint AS toast`,
        );
        const { rows: indexRows } = await client.query(
          `SELECT c.relname AS name, pg_relation_size(c.oid)::bigint AS bytes
             FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            WHERE i.indrelid = '${spec.table}'::regclass ORDER BY 2 DESC`,
        );
        const count = Number(size.n);
        results.push({
          table: spec.table,
          assume: spec.assume,
          rows: count,
          heapBytesPerRow: Number(size.heap) / count,
          indexBytesPerRow: Number(size.indexes) / count,
          toastBytesPerRow: Number(size.toast) / count,
          totalBytesPerRow:
            (Number(size.heap) + Number(size.indexes) + Number(size.toast)) /
            count,
          indexes: indexRows.map((row) => ({
            name: row.name,
            bytesPerRow: Number(row.bytes) / count,
          })),
        });
      } catch (error) {
        results.push({ table: spec.table, error: String(error.message) });
      }
    }
    return { serverVersion: version, rowsPerTable: rows, tables: results };
  } finally {
    await client.end();
    if (!keep) await admin.query(`DROP DATABASE IF EXISTS ${probeDb}`);
    await admin.end();
  }
}

export function renderTable(report) {
  const lines = [
    `Postgres ${report.serverVersion}, ${report.rowsPerTable} hàng/bảng (số đo, không phải ước tính)`,
    '',
    'bảng                    byte/hàng  (heap + index)  index lớn nhất',
  ];
  for (const t of report.tables) {
    if (t.error) {
      lines.push(`${t.table.padEnd(24)}LỖI: ${t.error}`);
      continue;
    }
    const top = t.indexes[0];
    lines.push(
      `${t.table.padEnd(24)}${Math.round(t.totalBytesPerRow)
        .toString()
        .padStart(
          8,
        )}  (${Math.round(t.heapBytesPerRow)} + ${Math.round(t.indexBytesPerRow)})`.padEnd(
        58,
      ) + (top ? `${top.name} ${Math.round(top.bytesPerRow)}` : ''),
    );
  }
  return lines.join('\n');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = await measureRowSizes(args);
  console.log(renderTable(report));
  if (args.out) {
    writeFileSync(
      resolve(args.out),
      `${JSON.stringify({ ...report, measuredAt: new Date().toISOString() }, null, 2)}\n`,
    );
    console.log(`\nGhi ${args.out}`);
  }
}
