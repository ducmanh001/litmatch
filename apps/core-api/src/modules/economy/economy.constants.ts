/**
 * Hằng số của module Economy (docs/05 § 5.1) — mọi hằng có ngữ nghĩa vượt ra ngoài 1 file
 * (endpoint/status bên thứ 3, định danh DB/topic) khai ở đây NGAY TỪ ĐẦU, không đợi có nơi
 * dùng thứ 2. Hằng vận hành nội bộ của đúng 1 class (batch size mỗi tick, tên job) thì ở lại
 * file đó. Khi module khác cũng cần 1 hằng ở đây → chuyển lên `common/constants/`.
 */

// ---------- Định danh nội bộ (Kafka topic, DB constraint) ----------

/** Topic Kafka cho outbox event của Economy (naming docs/05 § 5.6). */
export const ECONOMY_EVENTS_TOPIC = 'litmatch.economy.events';

/** Unique constraint idempotency trên bảng transactions (migration economy-ledger) — chốt chặn replay (docs/05 § 5.10). */
export const UQ_TRANSACTIONS_IDEMPOTENCY_KEY = 'uq_transactions_idempotency_key';

// ---------- Google (hạ tầng cố định, không đổi theo môi trường — docs/05 § 5.1 case 3) ----------

/** Google Play Developer API — verify purchase + quét Voided Purchases. */
export const ANDROID_PUBLISHER_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
export const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Token endpoint cố định của Google OAuth2 — vừa là audience của JWT assertion, vừa là URL đổi token. */
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** purchaseState của Google Play: 0 = purchased (1 = canceled, 2 = pending). */
export const GOOGLE_PURCHASE_STATE_PURCHASED = 0;

// ---------- Apple (hạ tầng cố định) ----------

/** Endpoint verifyReceipt (legacy API) — quy tắc Apple: thử production trước, sandbox receipt thì gọi lại endpoint sandbox. */
export const APPLE_VERIFY_RECEIPT_URL = 'https://buy.itunes.apple.com/verifyReceipt';
export const APPLE_VERIFY_RECEIPT_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

/** Status verifyReceipt của Apple: 0 = hợp lệ; 21007 = receipt sandbox gửi vào endpoint production. */
export const APPLE_STATUS_OK = 0;
export const APPLE_STATUS_SANDBOX_RECEIPT = 21007;

/** App Store Server API — job quét Refund History; chọn prod/sandbox theo ECONOMY_APPLE_SERVER_API_ENV. */
export const APPLE_SERVER_API_URL = 'https://api.storekit.itunes.apple.com';
export const APPLE_SERVER_API_SANDBOX_URL = 'https://api.storekit-sandbox.itunes.apple.com';

/** Audience bắt buộc trong JWT gọi App Store Server API (theo spec Apple). */
export const APPSTORE_CONNECT_AUDIENCE = 'appstoreconnect-v1';
