#!/usr/bin/env node
/**
 * Mô hình TĂNG TRƯỞNG DỮ LIỆU Postgres theo năm (tất định), bổ sung cho `model.mjs` (tải realtime/DB theo giây).
 *
 *   pnpm capacity:data                       # kịch bản mặc định (10 triệu CCU, số liệu tải lấy từ model.mjs)
 *   pnpm capacity:data --ccu=2000000 --years=3
 *   pnpm capacity:data --annualGrowthRate=0.3 --years=5
 *   pnpm capacity:data --json
 *
 * Nguồn của từng con số:
 *   - byte/hàng : ĐO bằng `pnpm capacity:row-sizes` trên Postgres 16 (heap + mọi index), lưu ở `row-sizes.json`;
 *   - số hàng/ngày: ĐỀ BÀI + GIẢ ĐỊNH hành vi ghi ngay trong `SCENARIO` — thay bằng số của chính hệ thống
 *     (`pg_stat_user_tables.n_tup_ins`) trước khi dùng để mua đĩa;
 *   - vòng đời: HAI cột tách bạch — `retentionDays` là cái mã CHẠY ĐƯỢC khi `RETENTION_MODE=delete` với giá trị mặc định
 *     (null = không có/giữ vĩnh viễn), còn `decision` là khuyến nghị CHƯA bật (cần chủ sản phẩm/pháp lý/bảo mật chốt).
 *
 * Mọi tổng là DUNG LƯỢNG BẢNG tại năm N (stock), KHÔNG so sánh với tốc độ tăng mỗi năm (flow).
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
 * mỗi RETENTION_INTERVAL_MS. Ở các giá trị mặc định (5.000 × 60 / 60 giây) = 5.000 hàng/giây/quy tắc. Đo lại được bằng
 * `scripts/capacity/bench/retention-delete.mjs` (3 triệu hàng refresh_tokens, container cục bộ, một kết nối, trong cache): xoá
 * 533.399 hàng trong 2,9 giây ≈ 184.500 hàng/giây, 288 byte WAL/hàng, VACUUM 5,1 giây; một lần đo trước đó trên máy đang tải
 * cho ~39.800 hàng/giây (cùng 288 byte WAL/hàng) — chênh 4,6× giữa các lần chạy cho thấy đây KHÔNG phải số công suất đĩa
 * TB-scale. `scripts/capacity/bench/brin-churn.mjs`: sau 4 vòng xoá-rồi-chèn-lại chọn lô 5.000 hàng bằng B-tree ≈ 0,6 ms/124
 * buffer, BRIN cùng bảng ≈ 430–540 ms/~51.000 buffer (lý do migration 1758800000000 thay BRIN bằng B-tree). Các số này chỉ cho
 * thấy bước chọn/xoá lô không phải điểm nghẽn TRONG ĐIỀU KIỆN LAB (một kết nối, trong cache, không ghi đồng thời); công suất
 * trên đĩa quy mô TB và dưới tải ghi thật CHƯA đo.
 */
export const RETENTION_DEFAULT_ROWS_PER_SEC = (5_000 * 60) / 60;
/** Giờ cao điểm ghi gấp ~2 lần trung bình: cảnh báo khi tốc độ xoá TRUNG BÌNH đã chạm một nửa công suất. */
const RETENTION_HEADROOM = 0.5;

/**
 * Story sweeper (apps/core-api/src/modules/feed/jobs/story-sweeper.service.ts): lô, ngân sách và nghỉ là HẰNG SỐ trong mã,
 * KHÔNG chịu `RETENTION_*`; chỉ `STORY_SWEEPER_INTERVAL_MS` điều chỉnh được.
 */
export const STORY_SWEEPER = {
  batchStories: 500,
  tickBudgetSeconds: 30,
  pauseMs: 50,
  defaultIntervalMs: 3_600_000,
  /**
   * ĐO bằng `scripts/capacity/bench/story-sweeper.mjs` (Postgres 16.15 throwaway, 12.000 story × 100 lượt xem = 1,2 triệu hàng
   * cascade, hàng xen kẽ ngẫu nhiên): một lô 500 story mất p50 88 ms / p95 158 ms (≈ 530.000 story_views/giây, 59 byte WAL/hàng;
   * các lần chạy trước trên máy ít tải cho 67 ms/117 ms nên dao động ±30%). Bảng ~220 MB nằm gọn trong bộ nhớ nên đây là CẬN
   * TRÊN: ở quy mô TB trên đĩa lạnh sẽ chậm hơn — đo lại ở staging trước khi tin.
   */
  labBatchMs: 88,
  labViewsPerStory: 100,
};

export const SCENARIO = {
  // --- đề bài ---
  ccu: LOAD.ccu,
  annualGrowthRate: 0, // giả định: CCU/hành vi ghi năm đầu; tải mỗi năm sau nhân (1 + rate)
  matchesPerDay: LOAD.matchesPerDay,
  chatters: LOAD.chatters,
  // --- giả định hành vi (phải thay bằng số đo) ---
  avgToPeakConcurrency: 0.3, // CCU trung bình cả ngày / CCU đỉnh
  activeHoursPerDau: 1.5, // giờ mở app mỗi người dùng hoạt động mỗi ngày
  accessTokenMinutes: 15, // JWT_ACCESS_TTL_SECONDS=900 (đọc mã) → mỗi 15 phút một lần xoay refresh token khi đang mở app
  familyActiveDays: 30, // một họ token (một lần đăng nhập) sống bao nhiêu ngày còn xoay trước khi bị bỏ rơi → đăng nhập mới/DAU/ngày = 1/30
  refreshTtlDays: 30, // AUTH_REFRESH_TTL_DAYS mặc định
  refreshGraceDays: 7, // AUTH_REFRESH_RETENTION_GRACE_DAYS mặc định (job xoá token hết hạn quá hạn này)
  refreshRotatedPurgeDays: 7, // AUTH_REFRESH_ROTATED_RETENTION_DAYS KHUYẾN NGHỊ (mặc định trong mã là 0 = tắt)
  retentionBatchSize: 5_000, // RETENTION_BATCH_SIZE mặc định
  retentionMaxBatchesPerTick: 60, // RETENTION_MAX_BATCHES_PER_TICK mặc định (trước đây 20: xoá không kịp refresh_tokens)
  retentionIntervalSeconds: 60, // RETENTION_INTERVAL_MS mặc định (giây)
  retentionTickBudgetSeconds: 30, // shared per job, not a separate budget for every rule
  retentionBatchPauseMs: 50,
  retentionBatchLatencyMs: 0, // unknown until measured under concurrent writes; 0 keeps the optimistic batch-count ceiling
  retentionAdmissionFraction: 1, // measured fraction of scheduled ticks that actually run
  retentionRuleBudgetFraction: 1, // fraction of one job's time available to this rule (several rules share a job)
  phoneLoginShare: 0.05, // tỉ lệ DAU đăng nhập bằng OTP điện thoại mỗi ngày
  otpRequestsPerLogin: 1.3,
  ticketsPerMatch: 2.4, // 2 vé/cặp + ~20% vé hết hạn không ghép được
  matchesPerMatchingUserPerDay: 3,
  guestShareOfMatchingUsers: 0.1,
  guestQuotaKeysPerGuest: 3, // user + device + network (guest-match-quota.service.ts); khoá network dùng chung nên là cận trên
  voiceShare: LOAD.voiceShare,
  friendChatShare: LOAD.friendChatShare,
  messagesPerChatterPerSec: LOAD.messagesPerChatterPerSec,
  chatHoursPerDay: LOAD.chatHoursPerDay,
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
  storyViewsPerStory: 100, // giả định: số lượt xem trung bình mỗi story (cascade khi xoá story)
  ledgerTxPerDauPerDay: 0.1, // quà + mua VIP/diamond + speed-up + hoàn tiền
  entriesPerTransaction: 2.2,
  giftShareOfTransactions: 0.4,
  partyAndMovieMessagesPerDay: 2_000_000,
  moodEventsPerDauPerDay: 0.05,
};

/**
 * Số ngày TRUNG BÌNH một hàng `refresh_tokens` còn tồn tại khi bật dọn-lúc-xoay (`AUTH_REFRESH_ROTATED_RETENTION_DAYS = N`).
 * Dọn-lúc-xoay chỉ chạy bên trong họ còn đang xoay: một họ hoạt động `familyActiveDays` ngày thì phần hoạt động cũ hơn N ngày
 * bị xoá sau N ngày, còn N ngày hoạt động CUỐI (và token cuối) nằm lại tới `fullDays` = TTL + GRACE (job xoá theo expires_at).
 * L = 1 ngày → bằng fullDays (dọn-lúc-xoay vô dụng); L → ∞ → tiệm cận N.
 */
export function blendedRotatedRetentionDays({
  familyActiveDays,
  rotatedDays,
  fullDays,
}) {
  const active = Math.max(familyActiveDays, 1e-9);
  const purgedAfterN = Math.max(0, active - rotatedDays);
  const keptUntilExpiry = Math.min(active, rotatedDays);
  return (purgedAfterN * rotatedDays + keptUntilExpiry * fullDays) / active;
}

/**
 * Story sweeper có đủ công suất ở chu kỳ mặc định không. Mỗi tick xử lý tối đa `tickBudgetSeconds / (lô + nghỉ)` lô; cần đủ
 * lô để xoá hết story hết hạn trong ngày. `maxBatchMsForDefaultInterval` là thời gian lô tối đa mà chu kỳ mặc định còn đủ.
 */
export function sweeperAdequacy(s, storyViewsPerDay, sweeper = STORY_SWEEPER) {
  const storiesPerDay = storyViewsPerDay / s.storyViewsPerStory;
  const batchesNeededPerDay = Math.ceil(storiesPerDay / sweeper.batchStories);
  const ticksPerDay = 86_400_000 / sweeper.defaultIntervalMs;
  const batchesPerTickNeeded = batchesNeededPerDay / ticksPerDay;
  const budgetMs = sweeper.tickBudgetSeconds * 1000;
  // Thời gian lô lệ thuộc số lượt xem cascade mỗi story: tỉ lệ thuận với storyViewsPerStory.
  const labBatchMs =
    sweeper.labBatchMs * (s.storyViewsPerStory / sweeper.labViewsPerStory);
  const maxIntervalMsFor = (batchMs) => {
    const perTick = Math.max(
      1,
      Math.floor(budgetMs / (batchMs + sweeper.pauseMs)),
    );
    return Math.floor(86_400_000 / (batchesNeededPerDay / perTick));
  };
  return {
    storiesPerDay,
    batchesNeededPerDay,
    ticksPerDay,
    batchesPerTickNeeded,
    maxBatchMsForDefaultInterval:
      budgetMs / batchesPerTickNeeded - sweeper.pauseMs,
    labBatchMs,
    headroomAtLab:
      (budgetMs / batchesPerTickNeeded - sweeper.pauseMs) / labBatchMs,
    maxIntervalMsAtLab: maxIntervalMsFor(labBatchMs),
    maxIntervalMsAt5xSlower: maxIntervalMsFor(labBatchMs * 5),
    maxIntervalMsAt10xSlower: maxIntervalMsFor(labBatchMs * 10),
  };
}

/**
 * Mỗi bảng: số hàng/ngày + vòng đời.
 *  - `retentionDays`: cái mã CHẠY ĐƯỢC khi `RETENTION_MODE=delete` với giá trị mặc định; `null` = chưa có cơ chế (giữ vĩnh viễn).
 *  - `decision`: khuyến nghị CHƯA bật, cần chủ sản phẩm/pháp lý/bảo mật chốt (`recommendedDays: null` = không khuyến nghị xoá).
 *  - `deleteVia`: ai làm việc xoá — `job` (khung retention, chịu `RETENTION_*`), `sweeper` (story sweeper), `partition`
 *    (phân vùng + DROP, không xoá từng hàng).
 */
export function tableDefinitions(s, derived) {
  const { dau, messagesPerDay, notificationsPerDay } = derived;
  const matching = s.matchesPerDay;
  const matchingUsers = (matching * 2) / s.matchesPerMatchingUserPerDay;
  const rotationsPerDauPerDay =
    (s.activeHoursPerDau * 60) / s.accessTokenMinutes;
  const refreshFullDays = s.refreshTtlDays + s.refreshGraceDays;
  return [
    {
      table: 'refresh_tokens',
      rowsPerDay: dau * (rotationsPerDauPerDay + 1 / s.familyActiveDays),
      retentionDays: refreshFullDays,
      deleteVia: 'job',
      mechanism: `job xoá token hết hạn quá ${s.refreshGraceDays} ngày (theo expires_at): mọi hàng sống TTL ${s.refreshTtlDays} + ${s.refreshGraceDays} ngày`,
      decision: {
        recommendedDays: blendedRotatedRetentionDays({
          familyActiveDays: s.familyActiveDays,
          rotatedDays: s.refreshRotatedPurgeDays,
          fullDays: refreshFullDays,
        }),
        mechanism: `dọn-lúc-xoay (AUTH_REFRESH_ROTATED_RETENTION_DAYS=${s.refreshRotatedPurgeDays}, mặc định 0 = tắt): chỉ họ còn xoay được dọn; họ bị bỏ rơi giữ ${s.refreshRotatedPurgeDays} ngày hoạt động cuối tới hết hạn. Đánh đổi: token đã dọn bị phát lại chỉ bị từ chối, KHÔNG còn thu hồi cả họ`,
      },
    },
    {
      table: 'phone_otps',
      rowsPerDay: dau * s.phoneLoginShare * s.otpRequestsPerLogin,
      retentionDays: 1,
      deleteVia: 'job',
      mechanism:
        'xoá OTP quá 1 ngày (mã đã băm, chỉ cần cho giới hạn tần suất)',
    },
    {
      table: 'match_tickets',
      rowsPerDay: matching * s.ticketsPerMatch,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: {
        recommendedDays: 30,
        mechanism:
          'vé còn FK tới phiên: cần nới FK (SET NULL) hoặc phân vùng theo ngày rồi DROP partition',
      },
    },
    {
      table: 'match_sessions',
      rowsPerDay: matching,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: {
        recommendedDays: 90,
        mechanism:
          'giữ phiên đã thành bạn/đang có report; xoá phiên còn lại sau 90 ngày — cần phân vùng + giữ bằng chứng report',
      },
    },
    {
      table: 'call_sessions',
      rowsPerDay: matching * s.voiceShare,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: {
        recommendedDays: 180,
        mechanism: 'giữ 180 ngày cho tranh chấp tính phí rồi archive',
      },
    },
    {
      table: 'soul_match_ratings',
      rowsPerDay: matching * (1 - s.voiceShare) * 2,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: { recommendedDays: 90, mechanism: 'cùng vòng đời phiên Soul' },
    },
    {
      table: 'voice_match_reactions',
      rowsPerDay: matching * s.voiceShare * 1.5,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: { recommendedDays: 90, mechanism: 'cùng vòng đời cuộc gọi' },
    },
    {
      table: 'match_daily_quotas',
      rowsPerDay: matchingUsers * 1.3,
      retentionDays: 2,
      deleteVia: 'job',
      mechanism: 'xoá hàng của ngày đã qua (quota theo ngày UTC)',
    },
    {
      table: 'guest_match_quotas',
      rowsPerDay:
        matchingUsers * s.guestShareOfMatchingUsers * s.guestQuotaKeysPerGuest,
      retentionDays: 2,
      deleteVia: 'job',
      mechanism: 'xoá hàng của ngày đã qua',
    },
    {
      table: 'messages',
      rowsPerDay: messagesPerDay * s.friendChatShare,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá/archive',
      decision: {
        recommendedDays: 180,
        mechanism:
          'chat bạn bè: giữ nóng 180 ngày trong Postgres; cũ hơn archive ra kho lạnh có đường đọc lại (phân vùng theo tháng)',
      },
    },
    {
      table: 'soul_chat_messages',
      rowsPerDay: messagesPerDay * (1 - s.friendChatShare),
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá/archive',
      decision: {
        recommendedDays: 90,
        mechanism:
          'chat ẩn danh: 90 ngày; phòng đã thành bạn / còn report mở được giữ lại (bằng chứng T&S)',
      },
    },
    {
      table: 'notifications',
      rowsPerDay: notificationsPerDay,
      retentionDays: 0.6 * 90 + 0.4 * 365, // C10: đọc 90 ngày, chưa đọc 365 ngày (tỉ lệ đã đọc 60% là GIẢ ĐỊNH)
      deleteVia: 'job',
      mechanism:
        'ĐÃ CÓ (C10): NotificationRetentionJob, RETENTION_MODE=dry-run ở profile triển khai',
    },
    {
      table: 'outbox_events',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay,
      retentionDays: null, // relay tắt ở MỌI profile (env mặc định, K8s, compose, hosted) → không hàng nào được publish
      deleteVia: 'job',
      mechanism:
        'job chỉ xoá dòng ĐÃ publish; relay tắt (mặc định mọi profile) nên không dòng nào đủ điều kiện → bảng tăng vô hạn',
      decision: {
        recommendedDays: 7,
        mechanism:
          'bật relay (cần consumer) rồi xoá đã publish sau 7 ngày — hoặc ngừng ghi outbox khi không có consumer',
      },
    },
    {
      table: 'transactions',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism:
        'SỔ CÁI append-only — không xoá; giảm chi phí bằng phân vùng theo tháng + lưu trữ lạnh có kiểm soát',
    },
    {
      table: 'ledger_entries',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay * s.entriesPerTransaction,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'SỔ CÁI append-only — không xoá',
    },
    {
      table: 'gift_events',
      rowsPerDay: dau * s.ledgerTxPerDauPerDay * s.giftShareOfTransactions,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'gắn giao dịch sổ cái — giữ',
    },
    {
      table: 'video_views',
      rowsPerDay: dau * s.videoUserShare * s.videoViewsPerUserPerDay,
      retentionDays: null, // VIDEO_VIEW_RETENTION_DAYS mặc định 0 = giữ
      deleteVia: 'job',
      mechanism:
        'VIDEO_VIEW_RETENTION_DAYS mặc định 0 = giữ (quyết định sản phẩm)',
      decision: {
        recommendedDays: 180,
        mechanism:
          'bảng khử trùng (video, người xem): xoá hàng quá 180 ngày; sau đó người xem lại video cũ có thể được đếm thêm một lần',
      },
    },
    {
      table: 'video_reactions',
      rowsPerDay:
        dau * s.videoUserShare * s.videoViewsPerUserPerDay * s.videoLikeRate,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism:
        'trạng thái "đã thích" — giữ; dọn theo vòng đời video (video bị xoá thì xoá theo)',
    },
    {
      table: 'video_comments',
      rowsPerDay:
        dau * s.videoUserShare * s.videoViewsPerUserPerDay * s.videoCommentRate,
      retentionDays: null,
      deleteVia: 'job',
      mechanism:
        'nội dung người dùng — giữ; bình luận đã xoá mềm bị xoá cứng sau 30 ngày (phần nhỏ, không tính vào vòng đời)',
    },
    {
      table: 'reactions',
      rowsPerDay: dau * s.feedUserShare * s.feedReactionsPerUserPerDay,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'trạng thái "đã thích" bài feed — giữ',
    },
    {
      table: 'comments',
      rowsPerDay: dau * s.feedUserShare * s.feedCommentsPerUserPerDay,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'nội dung người dùng — giữ',
    },
    {
      table: 'story_views',
      rowsPerDay: dau * s.storyUserShare * s.storyViewsPerUserPerDay,
      retentionDays: 2,
      deleteVia: 'sweeper',
      mechanism:
        'story hết hạn sau 24 giờ; sweeper xoá story (cascade story_views) — công suất xem phần "story sweeper" bên dưới',
    },
    {
      table: 'party_room_comments',
      rowsPerDay: s.partyAndMovieMessagesPerDay / 2,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: { recommendedDays: 30, mechanism: 'chat phòng: 30 ngày' },
    },
    {
      table: 'movie_session_messages',
      rowsPerDay: s.partyAndMovieMessagesPerDay / 2,
      retentionDays: null,
      deleteVia: 'partition',
      mechanism: 'chưa có cơ chế xoá',
      decision: {
        recommendedDays: 30,
        mechanism: 'chat phiên xem phim: 30 ngày',
      },
    },
    {
      table: 'mood_status_events',
      rowsPerDay: dau * s.moodEventsPerDauPerDay,
      retentionDays: 7,
      deleteVia: 'job',
      mechanism:
        'trạng thái tâm trạng hết hạn sau 24 giờ; xoá sự kiện sau 7 ngày (không bao giờ ngắn hơn MOOD_STATUS_TTL_HOURS)',
    },
  ];
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export function computeDataGrowth(overrides = {}, years = 3) {
  const s = { ...SCENARIO, ...overrides };
  if (!Number.isInteger(years) || years < 1 || years > 100) {
    throw new Error('years must be an integer from 1 to 100');
  }
  if (
    !Number.isFinite(s.annualGrowthRate) ||
    s.annualGrowthRate <= -1 ||
    s.annualGrowthRate > 10
  ) {
    throw new Error('annualGrowthRate must be greater than -1 and at most 10');
  }
  for (const key of [
    'retentionAdmissionFraction',
    'retentionRuleBudgetFraction',
  ]) {
    if (!Number.isFinite(s[key]) || s[key] < 0 || s[key] > 1)
      throw new Error(`${key} must be between 0 and 1`);
  }
  for (const key of [
    'retentionTickBudgetSeconds',
    'retentionBatchPauseMs',
    'retentionBatchLatencyMs',
  ]) {
    if (!Number.isFinite(s[key]) || s[key] < 0)
      throw new Error(`${key} must be a non-negative finite number`);
  }
  if (
    !Number.isFinite(s.retentionIntervalSeconds) ||
    s.retentionIntervalSeconds <= 0
  )
    throw new Error('retentionIntervalSeconds must be greater than zero');
  for (const key of ['retentionBatchSize', 'retentionMaxBatchesPerTick']) {
    if (!Number.isSafeInteger(s[key]) || s[key] < 0)
      throw new Error(`${key} must be a non-negative safe integer`);
  }
  // MỌI knob tải chung với model.mjs phải đi qua đây, nếu không `--chatHoursPerDay=…` chỉ là tham số chết.
  const load = computeModel({
    ccu: s.ccu,
    chatters: s.chatters,
    matchesPerDay: s.matchesPerDay,
    messagesPerChatterPerSec: s.messagesPerChatterPerSec,
    chatHoursPerDay: s.chatHoursPerDay,
    voiceShare: s.voiceShare,
    friendChatShare: s.friendChatShare,
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
  const horizonDays = 365 * years;
  const finalYearFactor = (1 + s.annualGrowthRate) ** (years - 1);
  // Piecewise-constant annual traffic; integrate only the age range still held at the horizon.
  const arrivals = (rowsPerDay, fromDay, toDay) => {
    let rows = 0;
    for (let year = 0; year < years; year++) {
      const days = Math.max(
        0,
        Math.min(toDay, (year + 1) * 365) - Math.max(fromDay, year * 365),
      );
      rows += rowsPerDay * (1 + s.annualGrowthRate) ** year * days;
    }
    return rows;
  };
  // Stock at year N integrates retained arrivals, with the workload changing at each year boundary.
  const stockRows = (rowsPerDay, days) =>
    arrivals(
      rowsPerDay,
      days === null ? 0 : Math.max(0, horizonDays - days),
      horizonDays,
    );
  // Purge capacity of one retention rule (rows/day). Excess eligible arrivals form a backlog;
  // subsequent quieter years may drain it. No capacity or growth assumption is a runtime measurement.
  const batchCostMs = s.retentionBatchLatencyMs + s.retentionBatchPauseMs;
  const availableBudgetMs =
    s.retentionTickBudgetSeconds * 1000 * s.retentionRuleBudgetFraction;
  const batchesWithinBudget =
    availableBudgetMs === 0
      ? 0
      : batchCostMs > 0
        ? Math.floor(availableBudgetMs / batchCostMs)
        : s.retentionMaxBatchesPerTick;
  const effectiveBatches = Math.min(
    s.retentionMaxBatchesPerTick,
    batchesWithinBudget,
  );
  const capacityRowsPerDay =
    (s.retentionBatchSize *
      effectiveBatches *
      s.retentionAdmissionFraction *
      86_400) /
    s.retentionIntervalSeconds;
  const stockRowsCapped = (rowsPerDay, days, capacity) => {
    const total = arrivals(rowsPerDay, 0, horizonDays);
    if (days === null || horizonDays <= days) return total;
    let backlog = 0;
    let deleted = 0;
    // Eligible arrivals are the original traffic delayed by the retention period. Backlog may
    // grow in a busy year and drain in a quieter one; do not assume a constant arrival rate.
    for (let year = 0; year < years; year++) {
      const duration = Math.max(
        0,
        Math.min(horizonDays, days + (year + 1) * 365) - (days + year * 365),
      );
      if (duration === 0) continue;
      const eligible = rowsPerDay * (1 + s.annualGrowthRate) ** year * duration;
      const removed = Math.min(backlog + eligible, capacity * duration);
      backlog += eligible - removed;
      deleted += removed;
    }
    return total - deleted;
  };
  const tables = definitions.map((def) => {
    const bytesPerRow = sizes.get(def.table);
    if (bytesPerRow === undefined) {
      throw new Error(
        `Thiếu số đo byte/hàng cho ${def.table} trong row-sizes.json`,
      );
    }
    const bytesPerDay = def.rowsPerDay * bytesPerRow;
    const recommendedDays = def.decision
      ? def.decision.recommendedDays
      : def.retentionDays;
    const bounded = def.retentionDays !== null || recommendedDays !== null;
    const jobCapacity = def.deleteVia === 'job' ? capacityRowsPerDay : Infinity;
    return {
      ...def,
      rowsPerDayAtHorizon: def.rowsPerDay * finalYearFactor,
      recommendedDays,
      bytesPerRow: Math.round(bytesPerRow),
      gbPerDay: bytesPerDay / GB,
      tbPerYearNoRetention: (bytesPerDay * 365) / TB,
      rowsAfterYears: stockRows(def.rowsPerDay, null),
      tbAfterYearsNoRetention:
        (stockRows(def.rowsPerDay, null) * bytesPerRow) / TB,
      // Vòng đời MẶC ĐỊNH với RETENTION_* mặc định: nếu công suất job nhỏ hơn hàng vào thì backlog tăng mãi.
      tbAfterYearsDefault:
        (stockRowsCapped(def.rowsPerDay, def.retentionDays, jobCapacity) *
          bytesPerRow) /
        TB,
      // Cùng vòng đời mặc định nhưng RETENTION_* đã tăng đủ công suất (không backlog).
      tbAfterYearsDefaultTuned:
        (stockRows(def.rowsPerDay, def.retentionDays) * bytesPerRow) / TB,
      // hàng vào ÷ công suất mặc định của một quy tắc job (> 1: không theo kịp ở cấu hình mặc định).
      capacityRatio:
        def.deleteVia === 'job' && bounded
          ? capacityRowsPerDay > 0
            ? (def.rowsPerDay * finalYearFactor) / capacityRowsPerDay
            : null
          : 0,
      noPurgeCapacity:
        def.deleteVia === 'job' && bounded && capacityRowsPerDay === 0,
      tbAfterYearsRecommended:
        (stockRows(def.rowsPerDay, recommendedDays) * bytesPerRow) / TB,
      // Phần bảng còn TĂNG tiếp mỗi năm sau khi vòng đời đã vào ổn định (bảng không có vòng đời).
      tbPerYearStillGrowingDefault:
        def.retentionDays === null
          ? (bytesPerDay * finalYearFactor * 365) / TB
          : 0,
      tbPerYearStillGrowingRecommended:
        recommendedDays === null
          ? (bytesPerDay * finalYearFactor * 365) / TB
          : 0,
      // Tốc độ xoá trung bình bảng phải chịu để KHÔNG phình (nếu có vòng đời mặc định hoặc khuyến nghị).
      deletesPerSecAvg: bounded
        ? (def.rowsPerDay * finalYearFactor) / 86_400
        : 0,
    };
  });
  const sum = (key) => tables.reduce((total, t) => total + t[key], 0);
  const storyViews = tables.find((t) => t.table === 'story_views');
  return {
    inputs: { ...s, years },
    dau,
    dauAtHorizon: dau * finalYearFactor,
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
      // StorySweeper is independent of RETENTION_MODE; other retention jobs only count in dry-run.
      tbAfterYearsDryRun:
        sum('tbAfterYearsNoRetention') -
        storyViews.tbAfterYearsNoRetention +
        storyViews.tbAfterYearsDefault,
      tbAfterYearsDefault: sum('tbAfterYearsDefault'),
      tbAfterYearsDefaultTuned: sum('tbAfterYearsDefaultTuned'),
      tbAfterYearsRecommended: sum('tbAfterYearsRecommended'),
      tbPerYearStillGrowingDefault: sum('tbPerYearStillGrowingDefault'),
      tbPerYearStillGrowingRecommended: sum('tbPerYearStillGrowingRecommended'),
    },
    retentionCapacity: {
      effectiveBatchesPerTick: effectiveBatches,
      rowsPerSecondPerRule: capacityRowsPerDay / 86_400,
      hasBatchLatencyInput: s.retentionBatchLatencyMs > 0,
      admissionFraction: s.retentionAdmissionFraction,
      ruleBudgetFraction: s.retentionRuleBudgetFraction,
    },
    sweeper: sweeperAdequacy(s, storyViews.rowsPerDayAtHorizon),
  };
}

const fmt = (value, digits = 1) =>
  value >= 1000
    ? Math.round(value).toLocaleString('en-US')
    : value.toFixed(digits);
const fmtDays = (days) => (days === null ? '∞' : fmt(days, 0));

export function renderReport(model) {
  const n = model.inputs.years;
  const lines = [
    `Mô hình tăng trưởng dữ liệu — ${n} năm (Postgres ${model.pgVersion}, byte/hàng ĐO ${model.measuredAt?.slice(0, 10) ?? ''})`,
    `DAU ước tính = ${fmt(model.dau / 1e6)} triệu (CCU đỉnh ${fmt(model.inputs.ccu / 1e6)} triệu × ${model.inputs.avgToPeakConcurrency} ÷ ${model.inputs.activeHoursPerDau} giờ/DAU×24)`,
    `Tải năm đầu theo inputs; mỗi năm sau nhân (1 + annualGrowthRate), hiện ${fmt(model.inputs.annualGrowthRate * 100)}%/năm. DAU năm cuối ${fmt(model.dauAtHorizon / 1e6)} triệu. Hàng/ngày và TiB/năm trong bảng là năm đầu; cảnh báo công suất dọn dùng tải năm cuối.`,
    `Cột "giữ" = ngày: mặc định (mã chạy khi RETENTION_MODE=delete) → khuyến nghị (CHƯA bật). "TiB sau ${n}n" là DUNG LƯỢNG BẢNG tại năm ${n}; cột (mặc định) giữ NGUYÊN RETENTION_* mặc định (job xoá không kịp thì backlog tích lại), cột (khuyến nghị) giả định RETENTION_* đã tăng đủ.`,
    `Công suất dọn giả định: ${fmt(model.retentionCapacity.rowsPerSecondPerRule, 0)} hàng/giây/quy tắc; ${model.retentionCapacity.hasBatchLatencyInput ? 'độ trễ lô do caller cung cấp, cần evidence số đo' : 'CHƯA có độ trễ lô thực đo, đây là trần lạc quan'}. Admission ${fmt(model.inputs.retentionAdmissionFraction * 100, 0)}%, phần ngân sách cho một quy tắc ${fmt(model.inputs.retentionRuleBudgetFraction * 100, 0)}%.`,
    '',
    `bảng                    hàng/ngày  byte/hàng  GiB/ngày  TiB/năm  TiB sau ${n}n    giữ mặc định→khuyến nghị  TiB sau ${n}n (mặc định)  TiB sau ${n}n (khuyến nghị)  xoá/giây | cơ chế`,
  ];
  for (const t of model.tables) {
    lines.push(
      [
        t.table.padEnd(24),
        fmt(t.rowsPerDay / 1e6, 2).padStart(8) + 'M',
        String(t.bytesPerRow).padStart(10),
        fmt(t.gbPerDay).padStart(8),
        fmt(t.tbPerYearNoRetention, 2).padStart(7),
        fmt(t.tbAfterYearsNoRetention).padStart(11),
        `${fmtDays(t.retentionDays)}→${fmtDays(t.recommendedDays)}`.padStart(
          24,
        ),
        fmt(t.tbAfterYearsDefault, 2).padStart(22),
        fmt(t.tbAfterYearsRecommended, 2).padStart(24),
        (t.deletesPerSecAvg === 0 ? '—' : fmt(t.deletesPerSecAvg, 0)).padStart(
          9,
        ),
        `| ${t.mechanism}${t.decision ? ` [CẦN QUYẾT ĐỊNH: ${t.decision.mechanism}]` : ''}`,
      ].join(' '),
    );
  }
  const overDefault = model.tables.filter(
    (t) =>
      t.deleteVia === 'job' &&
      t.deletesPerSecAvg >
        RETENTION_HEADROOM * model.retentionCapacity.rowsPerSecondPerRule,
  );
  if (overDefault.length > 0) {
    const ratios = overDefault
      .map(
        (t) =>
          `${t.table} ${t.noPurgeCapacity ? 'không có công suất dọn' : `${t.capacityRatio.toFixed(1)}×`}`,
      )
      .join(', ');
    lines.push(
      '',
      `CẢNH BÁO: ${overDefault.map((t) => t.table).join(', ')} (hàng vào ÷ công suất một quy tắc: ${ratios}; > 1× nghĩa là KHÔNG theo kịp, backlog tăng mãi) cần xoá ≥ ${Math.round(RETENTION_HEADROOM * 100)}% công suất dọn giả định (${Math.round(model.retentionCapacity.rowsPerSecondPerRule)} hàng/giây/quy tắc; cao điểm ghi gấp ~2× trung bình) — đo lại độ trễ lô/admission, tăng ngân sách phù hợp hoặc chuyển sang phân vùng + DROP.`,
    );
  }
  const sw = model.sweeper;
  const minutes = (ms) => `${fmt(ms / 60_000, 0)} phút`;
  lines.push(
    '',
    `Story sweeper (chu kỳ mặc định ${minutes(STORY_SWEEPER.defaultIntervalMs)}, ngân sách ${STORY_SWEEPER.tickBudgetSeconds} giây/tick, lô ${STORY_SWEEPER.batchStories} story, nghỉ ${STORY_SWEEPER.pauseMs} ms — hằng số trong mã, KHÔNG chịu RETENTION_*): ` +
      `cần ~${fmt(sw.batchesNeededPerDay)} lô/ngày (${fmt(sw.storiesPerDay / 1e6, 2)} triệu story × ${model.inputs.storyViewsPerStory} lượt xem cascade). ` +
      `Đủ khi một lô ≤ ${fmt(sw.maxBatchMsForDefaultInterval, 0)} ms (đo ở lab: ${fmt(sw.labBatchMs, 0)} ms, dữ liệu trong cache → cận trên); ` +
      `chu kỳ tối đa nếu lô chậm hơn lab ×1/×5/×10: ${minutes(sw.maxIntervalMsAtLab)}/${minutes(sw.maxIntervalMsAt5xSlower)}/${minutes(sw.maxIntervalMsAt10xSlower)} (STORY_SWEEPER_INTERVAL_MS).`,
  );
  const t = model.totals;
  lines.push(
    '',
    `TỔNG (dung lượng bảng, chưa gồm WAL/replica/backup/bloat): năm đầu ghi ${fmt(t.tbPerYearNoRetention)} TiB nếu không dọn → ${fmt(t.tbAfterYearsNoRetention)} TiB sau ${n} năm với tăng trưởng tải đã chọn.`,
    `  - profile dry-run, story sweeper chạy kịp: ${fmt(t.tbAfterYearsDryRun)} TiB sau ${n} năm.`,
    `  - vòng đời MẶC ĐỊNH của mã, RETENTION_* mặc định: ${fmt(t.tbAfterYearsDefault)} TiB sau ${n} năm (gồm backlog của quy tắc xoá không kịp), riêng bảng giữ vĩnh viễn còn tăng ${fmt(t.tbPerYearStillGrowingDefault)} TiB/năm ở năm cuối.`,
    `  - cùng vòng đời mặc định nếu RETENTION_* đã tăng đủ công suất: ${fmt(t.tbAfterYearsDefaultTuned)} TiB sau ${n} năm.`,
    `  - nếu chấp nhận MỌI khuyến nghị: ${fmt(t.tbAfterYearsRecommended)} TiB sau ${n} năm, riêng bảng giữ vĩnh viễn còn tăng ${fmt(t.tbPerYearStillGrowingRecommended)} TiB/năm ở năm cuối (sổ cái + nội dung người dùng — cần kế hoạch archive riêng).`,
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
