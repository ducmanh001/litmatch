import {
  baseEnvSchema,
  createConfigValidator,
} from '@litmatch/config-validator';
import * as Joi from 'joi';

import { parseCorsOrigins } from '../common/cors/cors-origins';
import { parseLivekitRegionUrls } from '../common/livekit/livekit-url';

/**
 * Khớp 1-1 với `coreApiEnvSchema` bên dưới — dùng làm type param cho `ConfigService<CoreApiEnv, true>`
 * (docs/05 § 5.2): `getOrThrow('KEY', { infer: true })` tự suy kiểu, gõ sai/thiếu key báo lỗi
 * lúc build thay vì chỉ vỡ lúc chạy. Sửa 1 key ở schema thì sửa luôn ở đây (không có cách tự
 * sinh type từ `Joi.ObjectSchema`, đây là giới hạn đã biết, chấp nhận đánh đổi).
 */
export interface CoreApiEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  PORT: number;
  CORS_ORIGINS: string;
  SWAGGER_ENABLED: boolean;
  DATABASE_URL: string;
  REDIS_URL: string;
  KAFKA_BROKERS: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  AUTH_REFRESH_TTL_DAYS: number;
  AUTH_OTP_TTL_SECONDS: number;
  AUTH_OTP_MAX_ATTEMPTS: number;
  AUTH_OTP_REQUESTS_PER_HOUR: number;
  AUTH_OTP_PEPPER: string;
  AUTH_MIN_AGE: number;
  AUTH_GOOGLE_CLIENT_ID: string;
  AUTH_APPLE_CLIENT_ID: string;
  USER_DEFAULT_AVATAR_ID: string;
  ECONOMY_IAP_VERIFIER: 'dev' | 'store';
  ECONOMY_APPLE_SHARED_SECRET: string;
  ECONOMY_GOOGLE_PACKAGE_NAME: string;
  ECONOMY_GOOGLE_SA_EMAIL: string;
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: string;
  ECONOMY_STORE_HTTP_TIMEOUT_MS: number;
  ECONOMY_OUTBOX_RELAY_ENABLED: boolean;
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: number;
  ECONOMY_RECONCILIATION_ENABLED: boolean;
  ECONOMY_RECONCILIATION_INTERVAL_MS: number;
  ECONOMY_RECONCILIATION_FAST_INTERVAL_MS: number;
  ECONOMY_APPLE_WEBHOOK_VERIFIER: 'dev' | 'store';
  ECONOMY_APPLE_ROOT_CA_PEM: string;
  ECONOMY_GOOGLE_RTDN_VERIFIER: 'dev' | 'store';
  ECONOMY_GOOGLE_RTDN_AUDIENCE: string;
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: string;
  ECONOMY_APPLE_ISSUER_ID: string;
  ECONOMY_APPLE_KEY_ID: string;
  ECONOMY_APPLE_PRIVATE_KEY: string;
  ECONOMY_APPLE_BUNDLE_ID: string;
  ECONOMY_APPLE_SERVER_API_ENV: 'sandbox' | 'production';
  ECONOMY_REFUND_POLL_ENABLED: boolean;
  ECONOMY_REFUND_POLL_INTERVAL_MS: number;
  ECONOMY_REFUND_POLL_WINDOW_DAYS: number;
  MATCHING_MATCHER_INTERVAL_MS: number;
  MATCHING_MATCHER_BATCH_SIZE: number;
  MATCHING_SWEEPER_INTERVAL_MS: number;
  MATCHING_QUEUE_MAX_WAIT_SECONDS: number;
  MATCHING_CONFIRM_TIMEOUT_SECONDS: number;
  MATCHING_AGE_BAND_SIZE: number;
  MATCHING_SPEEDUP_PRICE_DIAMOND: number;
  MATCHING_SPEEDUP_MAX_PER_HOUR: number;
  MATCHING_PRIORITY_BOOST_MS: number;
  MATCHING_TRUST_PENALTY_MS_PER_POINT: number;
  MATCHING_TRUST_PENALTY_MAX_MS: number;
  SOUL_CHAT_DURATION_SECONDS: number;
  SOUL_RATING_WINDOW_SECONDS: number;
  SOUL_CHAT_MESSAGE_MAX_LENGTH: number;
  FRIEND_MESSAGE_MAX_LENGTH: number;
  STREAK_MILESTONE_DAYS: string;
  STREAK_WARNING_HOURS: number;
  STREAK_WARNING_CHECK_INTERVAL_MS: number;
  LIVEKIT_URL: string;
  LIVEKIT_REGION_URLS: string;
  LIVEKIT_API_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  CALLING_FREE_CALL_SECONDS: number;
  CALLING_PRICE_PER_MINUTE_DIAMOND: number;
  CALLING_PENDING_TIMEOUT_SECONDS: number;
  CALLING_TICKER_INTERVAL_MS: number;
  CALLING_TOKEN_TTL_SECONDS: number;
  PARTY_MAX_SPEAKERS: number;
  PARTY_MAX_MEMBERS: number;
  PARTY_TOKEN_TTL_SECONDS: number;
  PARTY_EMPTY_ROOM_TIMEOUT_SECONDS: number;
  PARTY_SWEEPER_INTERVAL_MS: number;
  PARTY_STALE_ROOM_SECONDS: number;
  PARTY_TITLE_MAX_LENGTH: number;
  PARTY_HOST_DISCONNECT_GRACE_SECONDS: number;
  PARTY_HOST_GRACE_CHECK_INTERVAL_MS: number;
  GIFT_POINTS_RATE_PERCENT: number;
  SAFETY_REMATCH_COOLDOWN_DAYS: number;
  SAFETY_REPORT_COOLDOWN_DAYS: number;
  SAFETY_TRUST_PENALTY_PER_REPORT: number;
  SAFETY_TRUST_PENALTY_DAILY_CAP: number;
  SAFETY_TRUST_SCORE_FLOOR: number;
  NOTIFICATION_PUSH_PROVIDER: 'dev' | 'fcm';
  MOVIE_MATCH_URL_MAX_LENGTH: number;
  MOVIE_MATCH_ALLOWED_VIDEO_HOSTS: string;
  MOVIE_MATCH_ANON_VIDEO_URLS: string;
  MOVIE_MATCH_ANON_DURATION_SECONDS: number;
  MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS: number;
  MOVIE_MATCH_MESSAGE_MAX_LENGTH: number;
  PALM_MATCH_TARGET_NAME_MAX_LENGTH: number;
  PALM_MATCH_QUEUE_MAX_WAIT_SECONDS: number;
  PALM_MATCH_SESSION_DURATION_SECONDS: number;
  DISCOVERY_GUEST_VISIBLE: boolean;
  DISCOVERY_AGE_BUCKETS: string;
  DISCOVERY_LOCATION_QUANTIZE_DEGREES: number;
  DISCOVERY_LOCATION_FRESHNESS_HOURS: number;
  DISCOVERY_NEARBY_RADIUS_KM: number;
  DISCOVERY_DISTANCE_BUCKETS_KM: string;
  DISCOVERY_LOCATION_UPDATE_RATE_LIMIT_PER_HOUR: number;
  DISCOVERY_NEARBY_QUERY_RATE_LIMIT_PER_HOUR: number;
  DISCOVERY_NEARBY_CANDIDATE_CAP: number;
  MATCHING_INVITE_TTL_SECONDS: number;
  MATCHING_INVITE_RATE_LIMIT_PER_HOUR: number;
  MATCHING_INVITE_SWEEPER_INTERVAL_MS: number;
  MOOD_STATUS_TTL_HOURS: number;
  STORY_TTL_HOURS: number;
  STORY_SWEEPER_INTERVAL_MS: number;
  VIDEO_CAPTION_MAX_LENGTH: number;
  VIDEO_MODERATION_MODE: 'pre' | 'post';
  VIDEO_QUALIFIED_VIEW_MIN_MS: number;
  VIDEO_UPLOAD_TIMEOUT_SECONDS: number;
  VIDEO_SWEEPER_INTERVAL_MS: number;
  VIDEO_REPORT_AUTOHIDE_THRESHOLD: number;
  VIDEO_RANK_WEIGHT_VIEW: number;
  VIDEO_RANK_WEIGHT_LIKE: number;
  VIDEO_RANK_WEIGHT_COMMENT: number;
  VIDEO_RANK_TIME_DECAY_HOURS: number;
  VIDEO_RANKING_JOB_INTERVAL_MS: number;
  THROTTLE_TTL_SECONDS: number;
  THROTTLE_LIMIT: number;
}

/**
 * Toàn bộ env key của core-api — không hardcode giá trị nghiệp vụ trong code (docs/05 § 5.1).
 * Naming: UPPER_SNAKE có prefix domain (docs/05 § 5.6).
 */
export const coreApiEnvSchema = Joi.object({
  ...baseEnvSchema,
  PORT: Joi.number().port().default(3000),
  // Task 0 (docs/12 § 12.7 point 3) — validate format lúc boot, không đợi tới enableCors runtime
  CORS_ORIGINS: Joi.string()
    .allow('')
    .default('')
    .custom((value: string) => {
      parseCorsOrigins(value); // sai format → throw, Joi báo lỗi với message của Error
      return value;
    }, 'danh sách origin http(s) hợp lệ, phân cách bằng dấu phẩy'),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis'] })
    .default('redis://localhost:6379'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),

  AUTH_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),
  AUTH_OTP_TTL_SECONDS: Joi.number().integer().min(60).default(300),
  AUTH_OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  AUTH_OTP_REQUESTS_PER_HOUR: Joi.number().integer().min(1).default(5),
  AUTH_OTP_PEPPER: Joi.string().min(16).required(),
  AUTH_MIN_AGE: Joi.number().integer().min(13).default(18),
  AUTH_GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  AUTH_APPLE_CLIENT_ID: Joi.string().allow('').default(''),

  USER_DEFAULT_AVATAR_ID: Joi.string().default('default-01'),

  ECONOMY_IAP_VERIFIER: Joi.string().valid('dev', 'store').default('dev'),
  ECONOMY_APPLE_SHARED_SECRET: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_PACKAGE_NAME: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_SA_EMAIL: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_STORE_HTTP_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .default(10_000),
  ECONOMY_OUTBOX_RELAY_ENABLED: Joi.boolean().default(false),
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: Joi.number()
    .integer()
    .min(200)
    .default(2000),
  ECONOMY_RECONCILIATION_ENABLED: Joi.boolean().default(true),
  ECONOMY_RECONCILIATION_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .default(300_000),
  // Tier fast (bất biến Nợ=Có + orphan receipt) chỉ là 1 câu aggregate + 1 câu COUNT → rẻ hơn
  // nhiều so với tier deep scan sample ví; default 60s = phát hiện lệch nhanh gấp 5 lần deep
  // (300s) mà vẫn không đáng kể với DB. Min 10s cùng bound với interval deep, chống set quá dày.
  ECONOMY_RECONCILIATION_FAST_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .default(60_000),

  // Refund/chargeback (docs/services/economy-service.md § 5)
  // Mặc định 'store' (fail-closed) — thiếu config thì getOrThrow() chết ngay lúc verify thay vì
  // âm thầm chấp nhận webhook giả mạo nếu ai đó quên set biến này ở production (docs/10 § Economy).
  ECONOMY_APPLE_WEBHOOK_VERIFIER: Joi.string()
    .valid('dev', 'store')
    .default('store'),
  ECONOMY_APPLE_ROOT_CA_PEM: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_VERIFIER: Joi.string()
    .valid('dev', 'store')
    .default('store'),
  ECONOMY_GOOGLE_RTDN_AUDIENCE: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
  ECONOMY_APPLE_ISSUER_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_KEY_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_APPLE_BUNDLE_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_SERVER_API_ENV: Joi.string()
    .valid('sandbox', 'production')
    .default('sandbox'),
  ECONOMY_REFUND_POLL_ENABLED: Joi.boolean().default(false),
  ECONOMY_REFUND_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(3_600_000),
  ECONOMY_REFUND_POLL_WINDOW_DAYS: Joi.number().integer().min(1).default(60),

  // Matching — Giai đoạn 2 M1 (docs/services/matching-service.md § 8); default khớp .env.example
  MATCHING_MATCHER_INTERVAL_MS: Joi.number().integer().min(50).default(300),
  MATCHING_MATCHER_BATCH_SIZE: Joi.number().integer().min(1).default(20),
  MATCHING_SWEEPER_INTERVAL_MS: Joi.number().integer().min(500).default(5000),
  MATCHING_QUEUE_MAX_WAIT_SECONDS: Joi.number().integer().min(5).default(120),
  MATCHING_CONFIRM_TIMEOUT_SECONDS: Joi.number().integer().min(3).default(15),
  MATCHING_AGE_BAND_SIZE: Joi.number().integer().min(1).default(5),
  MATCHING_SPEEDUP_PRICE_DIAMOND: Joi.number().integer().min(1).default(50),
  MATCHING_SPEEDUP_MAX_PER_HOUR: Joi.number().integer().min(1).default(3),
  MATCHING_PRIORITY_BOOST_MS: Joi.number().integer().min(0).default(300_000),
  // Trust score < 100 làm chậm priority matching (docs/services/safety-service.md § 3.2) —
  // KHÔNG chặn hẳn matching, chỉ làm "trẻ" ảo trong queue; ban thật là UserStatus.Banned
  MATCHING_TRUST_PENALTY_MS_PER_POINT: Joi.number()
    .integer()
    .min(0)
    .default(2000),
  MATCHING_TRUST_PENALTY_MAX_MS: Joi.number().integer().min(0).default(120_000),

  // Soul Match — Giai đoạn 2 (docs/services/soul-match-service.md § 6); default 2-3 phút theo docs/06
  SOUL_CHAT_DURATION_SECONDS: Joi.number().integer().min(30).default(150),
  SOUL_RATING_WINDOW_SECONDS: Joi.number().integer().min(30).default(120),
  // .max khớp MESSAGE_CONTENT_HARD_CAP (sanity cap transport — soul-match.constants.ts)
  SOUL_CHAT_MESSAGE_MAX_LENGTH: Joi.number()
    .integer()
    .min(1)
    .max(2000)
    .default(500),

  // Friend Chat 1-1 — Giai đoạn 2 (docs/services/friend-service.md § 7); chat lâu dài, không giới hạn ngắn như Soul Match
  // .max khớp MESSAGE_CONTENT_HARD_CAP (sanity cap transport — friend.constants.ts)
  FRIEND_MESSAGE_MAX_LENGTH: Joi.number()
    .integer()
    .min(1)
    .max(4000)
    .default(2000),

  // Streak trò chuyện (docs/services/streak-service.md, mở rộng module friend — W2)
  // Mốc ngày chạm milestone (realtime + notification), phân tách dấu phẩy, tăng dần
  STREAK_MILESTONE_DAYS: Joi.string().default('3,7,14,30,50,100'),
  // Giờ UTC trong ngày (0-23) — cron chỉ cảnh báo SAU mốc giờ này (gần hết ngày mà chưa nhắn)
  STREAK_WARNING_HOURS: Joi.number().integer().min(0).max(23).default(20),
  STREAK_WARNING_CHECK_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(3_600_000),

  // Calling — Giai đoạn 2 (docs/services/calling-service.md § 6); key/secret khớp livekit.yaml
  LIVEKIT_URL: Joi.string()
    .uri({ scheme: ['ws', 'wss'] })
    .default('ws://localhost:7880'),
  // GĐ7 multi-region (ADR 0005): JSON map region (User.region) → ws/wss URL edge LiveKit.
  // '' (default) = single-region, mọi client dùng LIVEKIT_URL — deploy hôm nay không đổi gì.
  // Region null/không có trong map cũng fallback LIVEKIT_URL. BẤT BIẾN: mọi URL trong map phải
  // cùng MỘT cụm LiveKit (chung Redis room state) — xem docs/adr/0005-livekit-hostnetwork-rtc.md.
  LIVEKIT_REGION_URLS: Joi.string()
    .allow('')
    .default('')
    .custom((value: string) => {
      parseLivekitRegionUrls(value); // sai format → throw, Joi báo lỗi với message của Error
      return value;
    }, 'JSON map region → LiveKit URL'),
  // Endpoint server-to-server (RoomServiceClient: createRoom/deleteRoom/updateParticipant...)
  // — KHÁC LIVEKIT_URL (endpoint client/browser dùng để join media). '' (default) = derive từ
  // LIVEKIT_URL như trước (đúng khi client và server cùng trỏ 1 địa chỉ LiveKit thật). Phải tách
  // riêng khi LIVEKIT_URL trỏ qua 1 proxy/CDN chỉ dành cho client (vd TLS tunnel LAN cho mobile
  // dev) — proxy đó không nhất thiết forward đúng path Twirp RPC hay có cert server tin được.
  LIVEKIT_API_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  LIVEKIT_API_KEY: Joi.string().default('devkey'),
  LIVEKIT_API_SECRET: Joi.string()
    .min(16)
    .default('devsecret_change_me_0123456789abcdef'),
  CALLING_FREE_CALL_SECONDS: Joi.number().integer().min(10).default(420),
  // 0 (default) = free-only, hết free window server tự end; >0 = trừ cả 2 bên mỗi phút
  CALLING_PRICE_PER_MINUTE_DIAMOND: Joi.number().integer().min(0).default(0),
  CALLING_PENDING_TIMEOUT_SECONDS: Joi.number().integer().min(5).default(60),
  CALLING_TICKER_INTERVAL_MS: Joi.number().integer().min(200).default(1000),
  CALLING_TOKEN_TTL_SECONDS: Joi.number().integer().min(30).default(120),

  // Party Room — Giai đoạn 3 (docs/services/party-room-service.md § 7)
  // Cap speaker là giới hạn CỨNG theo docs/03 § 3.8.A (consumer tăng N×(N-1)) — chỉ nới khi có cascade SFU
  PARTY_MAX_SPEAKERS: Joi.number().integer().min(1).default(8),
  // Truyền vào LiveKit maxParticipants lúc tạo room — SFU tự chặn join vượt ngưỡng
  PARTY_MAX_MEMBERS: Joi.number().integer().min(2).default(100),
  PARTY_TOKEN_TTL_SECONDS: Joi.number().integer().min(30).default(120),
  // LiveKit tự đóng room trống sau N giây — backstop tầng SFU cho phòng vô chủ
  PARTY_EMPTY_ROOM_TIMEOUT_SECONDS: Joi.number().integer().min(30).default(300),
  PARTY_SWEEPER_INTERVAL_MS: Joi.number().integer().min(1000).default(30_000),
  // Phòng active mà không còn member active quá N giây → sweeper đóng (webhook có thể rớt)
  PARTY_STALE_ROOM_SECONDS: Joi.number().integer().min(30).default(120),
  PARTY_TITLE_MAX_LENGTH: Joi.number().integer().min(1).max(500).default(100),
  // Host rớt kết nối NGOÀI Ý MUỐN (webhook participant_left) — chờ tự kết nối lại trước khi
  // đóng phòng (host_left); REST leave chủ động vẫn đóng ngay, không qua grace này (§ 4)
  PARTY_HOST_DISCONNECT_GRACE_SECONDS: Joi.number()
    .integer()
    .min(5)
    .default(15),
  // Tần suất quét phòng hết grace — tách riêng PARTY_SWEEPER_INTERVAL_MS (30s, backstop khác
  // hẳn: phòng vô chủ hoàn toàn) vì grace ngắn hơn nhiều, cần phát hiện sát giờ hơn
  PARTY_HOST_GRACE_CHECK_INTERVAL_MS: Joi.number()
    .integer()
    .min(1000)
    .default(5000),

  // Gift — Giai đoạn 3 (docs/services/gift-service.md); tỉ lệ quy đổi DIA→PTS cho người nhận,
  // PHẢI < 100 (docs/06 § Gift: nhận 1:1 biến gift thành kênh chuyển tiền ngang hàng)
  GIFT_POINTS_RATE_PERCENT: Joi.number().integer().min(0).max(99).default(40),

  // Safety — Giai đoạn 4 (docs/services/safety-service.md)
  // Không ghép lại nếu có report/block giữa 2 user trong X ngày gần nhất (docs/06)
  SAFETY_REMATCH_COOLDOWN_DAYS: Joi.number().integer().min(1).default(30),
  // 1 cặp (reporter, target) chỉ tính 1 report hiệu lực lên trust score mỗi X ngày — chống spam report cùng 1 người
  SAFETY_REPORT_COOLDOWN_DAYS: Joi.number().integer().min(1).default(7),
  SAFETY_TRUST_PENALTY_PER_REPORT: Joi.number().integer().min(0).default(5),
  // Trần tổng điểm trừ/ngày cho 1 target — chặn nhiều reporter khác nhau đánh sập trust score cùng lúc
  SAFETY_TRUST_PENALTY_DAILY_CAP: Joi.number().integer().min(0).default(20),
  SAFETY_TRUST_SCORE_FLOOR: Joi.number().integer().default(0),

  // Notification — Giai đoạn 4 (docs/services/notification-service.md § 4)
  // 'dev' (no-op, chặn cứng ở production) — chưa có FCM/APNs thật, giống ECONOMY_IAP_VERIFIER
  NOTIFICATION_PUSH_PROVIDER: Joi.string().valid('dev', 'fcm').default('dev'),

  // Movie Match — Giai đoạn 5 (docs/services/movie-match-service.md § 8)
  MOVIE_MATCH_URL_MAX_LENGTH: Joi.number().integer().min(1).default(2048),
  // Danh sách phân tách dấu phẩy — parse mảng ở service (không parse ở Joi cho đơn giản)
  MOVIE_MATCH_ALLOWED_VIDEO_HOSTS: Joi.string().default('youtube.com,youtu.be'),
  // Flow ghép ẩn danh (movie-match.html): server chọn video từ danh sách này (phân tách dấu phẩy)
  MOVIE_MATCH_ANON_VIDEO_URLS: Joi.string().default(
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ,https://www.youtube.com/watch?v=eRsGyueVLvQ',
  ),
  // 18:00 đúng timer badge mockup
  MOVIE_MATCH_ANON_DURATION_SECONDS: Joi.number()
    .integer()
    .min(60)
    .default(1080),
  MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS: Joi.number()
    .integer()
    .min(10)
    .default(120),
  MOVIE_MATCH_MESSAGE_MAX_LENGTH: Joi.number().integer().min(1).default(500),

  // Palm Match — Giai đoạn 5 (docs/services/palm-match-service.md § 5)
  PALM_MATCH_TARGET_NAME_MAX_LENGTH: Joi.number().integer().min(1).default(50),
  PALM_MATCH_QUEUE_MAX_WAIT_SECONDS: Joi.number()
    .integer()
    .min(10)
    .default(120),
  PALM_MATCH_SESSION_DURATION_SECONDS: Joi.number()
    .integer()
    .min(30)
    .default(300),

  // Discovery — browse-only W1 (docs/services/discovery-service.md)
  // Guest chưa gắn phone/social có xuất hiện trong browse không — chặn farm guest làm loãng pool
  DISCOVERY_GUEST_VISIBLE: Joi.boolean().default(false),
  // Mốc tuổi tăng dần, phân tách dấu phẩy — bucket rộng, không lộ tuổi chính xác (vd 18,25,31,41
  // → 18-24, 25-30, 31-40, 41+); parse mảng ở service, không parse ở Joi cho đơn giản
  DISCOVERY_AGE_BUCKETS: Joi.string().default('18,25,31,41'),

  // Nearby — W4 (docs/services/discovery-service.md § Nearby)
  // Lưới quantize toạ độ tại nguồn (độ) — ~0.0045° xấp xỉ 500m ở vĩ độ Việt Nam (10-21°N);
  // xấp xỉ do 1° kinh độ co lại theo cos(lat), chấp nhận sai số cho MVP (không cần PostGIS)
  DISCOVERY_LOCATION_QUANTIZE_DEGREES: Joi.number().positive().default(0.0045),
  // Vị trí quá hạn tự biến mất khỏi nearby (derive khi đọc, không cron dọn `user_locations`)
  DISCOVERY_LOCATION_FRESHNESS_HOURS: Joi.number().integer().min(1).default(24),
  // Bán kính tìm kiếm tối đa — dùng làm bounding-box prefilter trước khi tính haversine chính xác
  DISCOVERY_NEARBY_RADIUS_KM: Joi.number().positive().default(20),
  // Mốc khoảng cách tăng dần (km), phân tách dấu phẩy — API chỉ trả bucket, không bao giờ trả
  // khoảng cách/toạ độ chính xác (vd 1,3,5,10,20 → "<1km", "1-3km", ... "20km+")
  DISCOVERY_DISTANCE_BUCKETS_KM: Joi.string().default('1,3,5,10,20'),
  // Chống spam cập nhật vị trí (rò rỉ lộ trình di chuyển) — số lần ghi vị trí tối đa/giờ
  DISCOVERY_LOCATION_UPDATE_RATE_LIMIT_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .default(12),
  // Chống dò quét trilateration bằng nhiều truy vấn liên tiếp — số lần truy vấn nearby tối đa/giờ
  DISCOVERY_NEARBY_QUERY_RATE_LIMIT_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .default(30),
  // Trần an toàn số candidate lấy từ DB trước khi sort/paginate ở app (MVP: bounding-box btree +
  // haversine, không PostGIS — xem docs/services/discovery-service.md § Nearby)
  DISCOVERY_NEARBY_CANDIDATE_CAP: Joi.number().integer().min(1).default(500),

  // CTA mời Voice/Soul Match — W4, mở rộng module `matching` (docs/services/matching-service.md § Invite)
  // Invite hết hạn nếu người nhận không phản hồi — sweeper chuyển Pending → Expired
  MATCHING_INVITE_TTL_SECONDS: Joi.number().integer().min(30).default(3_600),
  // Đối xứng cho mọi user (không phân biệt giới tính trong logic) — chống spam mời hàng loạt
  MATCHING_INVITE_RATE_LIMIT_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .default(10),
  MATCHING_INVITE_SWEEPER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .default(60_000),

  // Mood — preset-only W1 (docs/services/mood-service.md)
  // TTL mood tính từ lúc set (snapshot vào expiresAt) — hết hạn = derive khi đọc, không cron
  MOOD_STATUS_TTL_HOURS: Joi.number().integer().min(1).default(24),

  // Stories — W3 (docs/services/feed-service.md § 8)
  // TTL story tính từ lúc tạo (snapshot vào expiresAt) — hết hạn = filter lúc đọc, sweeper chỉ dọn rác
  STORY_TTL_HOURS: Joi.number().integer().min(1).default(24),
  STORY_SWEEPER_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(3_600_000),

  // Video ngắn — W5, hướng Momo (docs/services/short-video-service.md)
  VIDEO_CAPTION_MAX_LENGTH: Joi.number().integer().min(1).default(500),
  // pre = duyệt trước khi public (dating app VN, mặc định an toàn); post = public ngay, duyệt sau
  VIDEO_MODERATION_MODE: Joi.string().valid('pre', 'post').default('pre'),
  // Watch-time tối thiểu để tính 1 view "qualified" — cộng Video.viewCount đúng 1 lần khi vượt ngưỡng
  VIDEO_QUALIFIED_VIEW_MIN_MS: Joi.number().integer().min(0).default(3_000),
  // Video kẹt ở 'uploading' quá lâu (client bỏ dở/crash giữa chừng) → sweeper expire sang 'failed'
  VIDEO_UPLOAD_TIMEOUT_SECONDS: Joi.number().integer().min(60).default(3_600),
  VIDEO_SWEEPER_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(3_600_000),
  // Số distinct reporter để auto-hide (published → removed) — KHÔNG phải trust-score cá nhân
  VIDEO_REPORT_AUTOHIDE_THRESHOLD: Joi.number().integer().min(1).default(5),
  // rankScore = view*W_VIEW + like*W_LIKE + comment*W_COMMENT, decay theo giờ kể từ createdAt
  VIDEO_RANK_WEIGHT_VIEW: Joi.number().min(0).default(1),
  VIDEO_RANK_WEIGHT_LIKE: Joi.number().min(0).default(3),
  VIDEO_RANK_WEIGHT_COMMENT: Joi.number().min(0).default(5),
  VIDEO_RANK_TIME_DECAY_HOURS: Joi.number().positive().default(48),
  VIDEO_RANKING_JOB_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(1_800_000),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});

export const validateCoreApiEnv = createConfigValidator(coreApiEnvSchema);
