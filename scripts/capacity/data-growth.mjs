#!/usr/bin/env node
/**
 * Mô hình TĂNG TRƯỞNG DỮ LIỆU Postgres theo năm (tất định), bổ sung cho `model.mjs` (tải realtime/DB theo giây).
 *
 *   pnpm capacity:data                       # kịch bản mặc định (10 triệu CCU, số liệu tải lấy từ model.mjs)
 *   pnpm capacity:data --ccu=2000000 --years=3
 *   pnpm capacity:data --json
 *
 * Nguồn của từng con số:
 *   - byte/hàng : ĐO bằng `pnpm capacity:row-sizes` trên Postgres 16 (heap + mọi index), lưu ở `row-sizes.json`;
 *   - số hàng/ngày: ĐỀ BÀI + GIẢ ĐỊNH hành vi ghi ngay trong `scenario` — thay bằng số của chính hệ thống
 *     (`pg_stat_user_tables.n_tup_ins`) trước khi dùng để mua đĩa;
 *   - vòng đời (`retentionDays`): KHUYẾN NGHỊ mặc định, mỗi dòng ghi rõ cơ chế/điều kiện an toàn; những bảng cần quyết định
 *     sản phẩm/pháp lý (chat, phiên ghép) được đánh dấu `decision: true`.
 *
 * KHÔNG tính: WAL, replica, backup, bloat do UPDATE/DELETE, index sâu hơn ở hàng tỷ hàng (+5–10%), ảnh/video/object storage.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULTS as LOAD, computeModel } from './model.mjs';

const ROW_SIZES = JSON.parse(
  readFileSync(new URL('./row-sizes.json', import.meta.url), 'utf8'),
);

/**
 * Công suất xoá mặc định của khung retention (ADR 0013): RETENTION_BATCH_SIZE × RETENTION_MAX_BATCHES_PER_TICK mỗi quy tắc
 * mỗi RETENTION_INTERVAL_MS. Ở các giá trị mặc định (5.000 × 20 / 60 giây) = ~1.667 hàng/giây/quy tắc. Đo thật (3 triệu
 * hàng refresh_tokens, container cục bộ, một kết nối): chọn lô bằng BRIN 1,7 ms/5.000 hàng, xoá ~39.800 hàng/giây,
 * 288 byte WAL/hàng, VACUUM 14 giây sau khi xoá 533.000 hàng — nên nghẽn là cấu hình, không phải khả năng của Postgres.
 */
export const RETENTION_DEFAULT_ROWS_PER_SEC = (5_000 * 20) / 60;
/** Giờ cao điểm ghi gấp ~2 lần trung bình: cảnh báo khi tốc độ xoá TRUNG BÌNH đã chạm một nửa công suất. */
const RETENTION_HEADROOM = 0.5;

export const SCENARIO = {
  // --- đề bài ---
  ccu: LOAD.ccu,
  matchesPerDay: LOAD.matchesPerDay,
  chatters: LOAD.chatters,
  // --- giả định hành vi (phải thay bằng số đo) ---
  avgToPeakConcurrency: 0.3, // CCU trung bình cả ngày / CCU đỉnh
  activeHoursPerDau: 1.5, // giờ mở app mỗi người dùng hoạt động mỗi ngày
  accessTokenMinutes: 15, // JWT_ACCESS_TTL_SECONDS=900 (đọc mã) → mỗi 15 phút một lần xoay refresh token khi đang mở app
  phoneLoginShare: 0.05, // tỉ lệ DAU đăng nhập bằng OTP điện thoại mỗi ngày
  otpRequestsPerLogin: 1.3,
  ticketsPerMatch: 2.4, // 2 vé/cặp + ~20% vé hết hạn không ghép được
  matchesPerMatchingUserPerDay: 3,
  guestShareOfMatchingUsers: 0.1,
  voiceShare: LOAD.voiceShare,
  friendChatShare: LOAD.friendChatShare,
  messagesPerChatterPerSec: LOAD.messagesPerChatterPerSec,
  chatHoursPerDay: LOAD.chatHoursPerDay,
  soulMessagesPerSession: 20,
  notificationsOtherPerDauPerDay: 0.2, // quà, like, comment, theo dõi, hệ thống
  videoUserShare: 0.1,
  videoViewsPerUserPerDay: 30, // mỗi lượt xem là cặp (video, người xem) MỚI — cận trên
  videoLikeRate: 0.05,
  videoCommentRate: 0.005,
  feedUserShare: 0.15,
  feedReactionsPerUserPerDay: 5,
  feedCommentsPerUserPerDay: 0.5,
  storyUserShare: 0.2,
  storyViewsPerUserPerDay: 10,
  ledgerTxPerDauPerDay: 0.1, // quà + mua VIP/diamond + speed-up + hoàn tiền
  entriesPerTransaction: 2.2,
  giftShareOfTransactions: 0.4,
  partyAndMovieMessagesPerDay: 2_000_000,
  moodEventsPerDauPerDay: 0.05,
};

/**
 * Mỗi bảng: số hàng/ngày + vòng đời khuyến nghị. `retentionDays: null` = giữ vĩnh viễn (trạng thái hoặc sổ cái).
 * `mechanism` = nó được dọn bằng gì; `decision` = cần chủ sản phẩm/pháp lý chốt trước khi bật xoá thật.
 */
export function tableDefinitions(s, derived) {
  const { dau, messagesPerDay, notificationsPerDay } = derived;
  const matching = s.matchesPerDay;
  const matchingUsers = (matching * 2) / s.matchesPerMatchingUserPerDay;
  return [
    {
      table: 'refresh_tokens',
      rowsPerDay: dau * (1 + (s.activeHoursPerDau * 60) / s.accessTokenMinutes),
      retentionDays: 7,
      mechanism:
        'xoá token đã xoay/thu hồi sau 7 ngày hoặc hết hạn quá 7 ngày (token cũ đã vô hiệu; chỉ mất khả năng thu hồi cả họ khi bị phát lại sau 7 ngày)',
      decision: true,
    },
    {
      table: 'phone_otps',
      rowsPerDay: dau * s.phoneLoginShare * s.otpRequestsPerLogin,
      retentionDays: 1,
      mechanism:
        'xoá OTP hết hạn/đã dùng sau 1 ngày (mã đã băm, chỉ cần cho giới hạn tần suất)',
    },
    {
      table: 'match_tickets',
      rowsPerDay: matching * s.ticketsPerMatch,
      retentionDays: 30,
      mechanism:
        'vé còn FK tới phiên: cần nới FK (SET NULL) hoặc phân vùng theo ngày rồi DROP partition',
      decision: true,
    },
    {
      table: 'match_sessions',
      rowsPerDay: matching,
      retentionDays: 90,
      mechanism:
        'giữ phiên đã thành bạn/đang có report; xoá phiên còn lại sau 90 ngày — cần phân vùng + giữ bằng chứng report',
      decision: true,
    },
    {
      table: 'call_sessions',
      rowsPerDay: matching * s.voiceShare,
      retentionDays: 180,
      mechanism: 'giữ 180 ngày cho tranh chấp tính phí rồi archive',
      decision: true,
    },
    {
      table: 'soul_match_ratings',
      rowsPerDay: matching * (1 - s.voiceShare) * 2,
      retentionDays: 90,
      mechanism: 'cùng vòng đời phiên Soul',
      decision: true,
    },
    {
      table: 'voice_match_reactions',
      rowsPerDay: matching * s.voiceShare * 1.5,
      retentionDays: 90,
      mechanism: 'cùng vòng đời cuộc gọi',
      decision: true,
    },
    {
      table: 'match_daily_quotas',
      rowsPerDay: matchingUsers * 1.3,
      retentionDays: 2,
      mechanism: 'xoá hàng của ngày đã qua (quota theo ngày UTC)',
    },
    {
      table: 'guest_match_quotas',
      rowsPerDay: matchingUsers * s.guestShareOfMatchingUsers,
      retentionDays: 2,
      mechanism: 'xoá hàng của ngày đã qua',
    },
    {
      table: 'messages',
      rowsPerDay: messagesPerDay * s.friendChatShare,
      retentionDays: 180,
      mechanism:
        'chat bạn bè: giữ nóng 180 ngày trong Postgres; cũ hơn archive ra kho lạnh có đường đọc lại (phân vùng theo tháng)',
      decision: true,
    },
    {
      table: 'soul_chat_messages',
      rowsPerDay: messagesPerDay * (1 - s.friendChatShare),
      retentionDays: 90,
      mechanism:
        'chat ẩn danh: 90 ngày; phòng đã thành bạn / còn report mở được giữ lại (bằng chứng T&S)',
      decision: true,
    },
    {
      table: 'notifications',
      rowsPerDay: notificationsPerDay,
      retentionDays: 0.6 * 90 + 0.4 * 365, // đã cơ chế C10: đọc 90 ngày, chưa đọc 365 ngày
      mechanism:
        'ĐÃ CÓ (C10): NotificationRetentionJob, RETENTION_MODE=dry-run ở profile triển khai',
    },
    {
      table: 'outbox_events',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay,
      retentionDays: 7,
      mechanism:
        'xoá sự kiện đã publish sau 7 ngày; relay tắt ở K8s thì KHÔNG bao giờ publish → bảng tăng vô hạn nếu không xử lý',
    },
    {
      table: 'transactions',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay,
      retentionDays: null,
      mechanism:
        'SỔ CÁI append-only — không xoá; giảm chi phí bằng phân vùng theo tháng + lưu trữ lạnh có kiểm soát',
    },
    {
      table: 'ledger_entries',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay * s.entriesPerTransaction,
      retentionDays: null,
      mechanism: 'SỔ CÁI append-only — không xoá',
    },
    {
      table: 'gift_events',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay * s.giftShareOfTransactions,
      retentionDays: null,
      mechanism: 'gắn giao dịch sổ cái — giữ',
    },
    {
      table: 'video_views',
      rowsPerDay: dau * s.videoUserShare * s.videoViewsPerUserPerDay,
      retentionDays: 180,
      mechanism:
        'bảng khử trùng (video, người xem): xoá hàng quá 180 ngày; sau đó người xem lại video cũ có thể được đếm thêm một lần',
      decision: true,
    },
    {
      table: 'video_reactions',
      rowsPerDay:
        dau * s.videoUserShare * s.videoViewsPerUserPerDay * s.videoLikeRate,
      retentionDays: null,
      mechanism:
        'trạng thái "đã thích" — giữ; dọn theo vòng đời video (video bị xoá thì xoá theo)',
    },
    {
      table: 'video_comments',
      rowsPerDay:
        dau * s.videoUserShare * s.videoViewsPerUserPerDay * s.videoCommentRate,
      retentionDays: null,
      mechanism:
        'nội dung người dùng — giữ; bình luận đã xoá mềm bị xoá cứng sau 30 ngày',
    },
    {
      table: 'reactions',
      rowsPerDay: dau * s.feedUserShare * s.feedReactionsPerUserPerDay,
      retentionDays: null,
      mechanism: 'trạng thái "đã thích" bài feed — giữ',
    },
    {
      table: 'comments',
      rowsPerDay: dau * s.feedUserShare * s.feedCommentsPerUserPerDay,
      retentionDays: null,
      mechanism: 'nội dung người dùng — giữ',
    },
    {
      table: 'story_views',
      rowsPerDay: dau * s.storyUserShare * s.storyViewsPerUserPerDay,
      retentionDays: 2,
      mechanism: 'story hết hạn sau 24 giờ; xoá lượt xem của story đã hết hạn',
    },
    {
      table: 'party_room_comments',
      rowsPerDay: s.partyAndMovieMessagesPerDay / 2,
      retentionDays: 30,
      mechanism: 'chat phòng: 30 ngày',
      decision: true,
    },
    {
      table: 'movie_session_messages',
      rowsPerDay: s.partyAndMovieMessagesPerDay / 2,
      retentionDays: 30,
      mechanism: 'chat phiên xem phim: 30 ngày',
      decision: true,
    },
    {
      table: 'mood_status_events',
      rowsPerDay: dau * s.moodEventsPerDauPerDay,
      retentionDays: 7,
      mechanism:
        'trạng thái tâm trạng hết hạn sau 24 giờ; xoá sự kiện sau 7 ngày',
    },
  ];
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export function computeDataGrowth(overrides = {}, years = 3) {
  const s = { ...SCENARIO, ...overrides };
  const load = computeModel({
    ccu: s.ccu,
    chatters: s.chatters,
    matchesPerDay: s.matchesPerDay,
  });
  const dau = (s.ccu * s.avgToPeakConcurrency * 24) / s.activeHoursPerDau;
  const messagesPerDay = load.chat.messagesPerDay;
  // Cổng gộp thông báo (C9): chỉ tin đầu tiên trong cửa sổ 60 giây mỗi chuỗi mở thông báo.
  const msgsPerWindow =
    s.messagesPerChatterPerSec * LOAD.friendNotifyWindowSeconds;
  const openFraction = Math.min(1, 1 / Math.max(1, msgsPerWindow));
  const notificationsPerDay =
    messagesPerDay * s.friendChatShare * openFraction +
    s.matchesPerDay * 2 +
    dau * s.notificationsOtherPerDauPerDay;

  const sizes = new Map(
    ROW_SIZES.tables
      .filter((t) => !t.error)
      .map((t) => [t.table, t.totalBytesPerRow]),
  );
  const definitions = tableDefinitions(s, {
    dau,
    messagesPerDay,
    notificationsPerDay,
  });
  const tables = definitions.map((def) => {
    const bytesPerRow = sizes.get(def.table);
    if (bytesPerRow === undefined) {
      throw new Error(
        `Thiếu số đo byte/hàng cho ${def.table} trong row-sizes.json`,
      );
    }
    const bytesPerDay = def.rowsPerDay * bytesPerRow;
    const steadyRows =
      def.retentionDays === null
        ? def.rowsPerDay * 365 * years
        : def.rowsPerDay * def.retentionDays;
    return {
      ...def,
      bytesPerRow: Math.round(bytesPerRow),
      gbPerDay: bytesPerDay / GB,
      tbPerYearNoRetention: (bytesPerDay * 365) / TB,
      rowsAfterYears: def.rowsPerDay * 365 * years,
      tbAfterYearsNoRetention: (bytesPerDay * 365 * years) / TB,
      steadyRows,
      tbWithPolicy: (steadyRows * bytesPerRow) / TB,
      // Tốc độ xoá trung bình mà job retention phải duy trì để bảng không phình (bảng có vòng đời).
      deletesPerSecAvg:
        def.retentionDays === null ? 0 : def.rowsPerDay / 86_400,
    };
  });
  const sum = (key) => tables.reduce((total, t) => total + t[key], 0);
  return {
    inputs: { ...s, years },
    dau,
    messagesPerDay,
    notificationsPerDay,
    pgVersion: ROW_SIZES.serverVersion,
    measuredAt: ROW_SIZES.measuredAt,
    tables: tables.sort(
      (a, b) => b.tbPerYearNoRetention - a.tbPerYearNoRetention,
    ),
    totals: {
      tbPerYearNoRetention: sum('tbPerYearNoRetention'),
      tbAfterYearsNoRetention: sum('tbAfterYearsNoRetention'),
      tbWithPolicy: sum('tbWithPolicy'),
    },
  };
}

const fmt = (value, digits = 1) =>
  value >= 1000
    ? Math.round(value).toLocaleString('en-US')
    : value.toFixed(digits);

export function renderReport(model) {
  const lines = [
    `Mô hình tăng trưởng dữ liệu — ${model.inputs.years} năm (Postgres ${model.pgVersion}, byte/hàng ĐO ${model.measuredAt?.slice(0, 10) ?? ''})`,
    `DAU ước tính = ${fmt(model.dau / 1e6)} triệu (CCU đỉnh ${fmt(model.inputs.ccu / 1e6)} triệu × ${model.inputs.avgToPeakConcurrency} ÷ ${model.inputs.activeHoursPerDau} giờ/DAU×24)`,
    '',
    'bảng                    hàng/ngày  byte/hàng  GB/ngày  TB/năm   TB sau N năm   giữ (ngày)  TB ổn định  xoá/giây | cơ chế',
  ];
  for (const t of model.tables) {
    lines.push(
      [
        t.table.padEnd(24),
        fmt(t.rowsPerDay / 1e6, 2).padStart(8) + 'M',
        String(t.bytesPerRow).padStart(10),
        fmt(t.gbPerDay).padStart(8),
        fmt(t.tbPerYearNoRetention, 2).padStart(8),
        fmt(t.tbAfterYearsNoRetention).padStart(12),
        (t.retentionDays === null ? '∞' : fmt(t.retentionDays, 0)).padStart(11),
        fmt(t.tbWithPolicy, 2).padStart(11),
        (t.deletesPerSecAvg === 0 ? '—' : fmt(t.deletesPerSecAvg, 0)).padStart(
          9,
        ),
        `| ${t.mechanism}${t.decision ? ' [CẦN QUYẾT ĐỊNH]' : ''}`,
      ].join(' '),
    );
  }
  const overDefault = model.tables.filter(
    (t) =>
      t.deletesPerSecAvg > RETENTION_HEADROOM * RETENTION_DEFAULT_ROWS_PER_SEC,
  );
  if (overDefault.length > 0) {
    lines.push(
      '',
      `CẢNH BÁO: ${overDefault.map((t) => t.table).join(', ')} cần xoá ≥ ${Math.round(RETENTION_HEADROOM * 100)}% công suất mặc định của khung retention (${Math.round(RETENTION_DEFAULT_ROWS_PER_SEC)} hàng/giây/quy tắc; cao điểm ghi gấp ~2× trung bình) — tăng RETENTION_MAX_BATCHES_PER_TICK/RETENTION_BATCH_SIZE hoặc chuyển sang phân vùng + DROP.`,
    );
  }
  lines.push(
    '',
    `TỔNG: ${fmt(model.totals.tbPerYearNoRetention)} TB/năm nếu không dọn; ${fmt(model.totals.tbAfterYearsNoRetention)} TB sau ${model.inputs.years} năm; ` +
      `${fmt(model.totals.tbWithPolicy)} TB ở trạng thái ổn định với vòng đời khuyến nghị (chưa gồm WAL/replica/backup/bloat).`,
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const overrides = {};
  let years = 3;
  let json = false;
  for (const raw of argv) {
    if (raw === '--json') json = true;
    else if (raw.startsWith('--years=')) years = Number(raw.slice(8));
    else if (raw.startsWith('--')) {
      const [key, value] = raw.slice(2).split('=');
      if (!(key in SCENARIO)) throw new Error(`Tham số không biết: --${key}`);
      overrides[key] = Number(value);
    }
  }
  return { overrides, years, json };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { overrides, years, json } = parseArgs(process.argv.slice(2));
  const model = computeDataGrowth(overrides, years);
  console.log(json ? JSON.stringify(model, null, 2) : renderReport(model));
}
