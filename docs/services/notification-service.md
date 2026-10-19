# Notification Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 4 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/notification`.

## 1. Cơ chế — gọi trực tiếp qua DI, KHÔNG Outbox/Kafka

Vẫn là modular monolith, chỉ có ĐÚNG 1 consumer (Notification) cho các sự kiện match/message/
gift/like-comment — chưa có nhu cầu tách service. Outbox+Kafka (docs/03 § 3.6) giải quyết
dual-write problem khi publish và ghi DB là 2 hệ khác nhau; ở đây Notification chỉ là 1 bảng khác
trong CÙNG Postgres, nên module sinh sự kiện (Matching/Friend/Gift/Feed) gọi thẳng
`NotificationService` qua DI, **trong cùng transaction đã có** khi có thể — không dual-write, không
cần Kafka. Quyết định này user đã chọn tường minh (so với xây Outbox chung — nhiều hạ tầng hơn cho
đúng 1 consumer, chưa cần thiết ở GĐ4). Đổi sang Outbox+Kafka sau NẾU thật sự tách Notification
thành consumer độc lập/nhiều consumer.

- Có transaction sẵn (Matching matcher/`confirmTicket` legacy, Gift `sendGift` qua `withinTransaction`, Feed
  `like`/`createComment`): gọi `NotificationService.createWithManager(manager, input)` — ghi
  Notification atomic cùng hành động gốc.
- Không có transaction chia sẻ được (Friend `sendMessage` — message tự commit riêng, xem
  `friend-service.md`): gọi `NotificationService.create(input)` — tự transaction riêng, chạy NGAY
  SAU khi message đã persist, best-effort (bọc try/catch, log lỗi, KHÔNG làm fail luồng gửi tin
  nhắn — notification là side effect phụ, docs/03 § 3.6).
- Push (best-effort, SAU khi transaction/insert notification đã commit — không bao giờ trước):
  `NotificationService.sendPush(notification)`, nuốt lỗi + log, không throw ra caller.

## 2. Data model

- `Notification`: `userId` (người nhận), `type` (enum), `payload` (jsonb — dữ liệu tối thiểu để
  client tự render, KHÔNG hardcode text hiển thị ở backend), `readAt` (nullable), `createdAt`.
- **Retention (ADR 0013)**: `NotificationRetentionJob` chạy khi `RETENTION_MODE` là `dry-run` (chỉ đếm) hoặc `delete` (xoá thật theo lô; mặc định
  `off`): đã đọc quá `NOTIFICATION_READ_RETENTION_DAYS` (90) kể từ `readAt`, chưa đọc quá
  `NOTIFICATION_UNREAD_RETENTION_DAYS` (365) kể từ `createdAt`; 0 = giữ vĩnh viễn. Hai quy tắc riêng vì đọc
  hội thoại không đánh dấu notification đã đọc. Không FK nào trỏ vào bảng nên xoá an toàn; index một phần
  `idx_notifications_read_at` / `idx_notifications_unread_created` phục vụ chọn lô. Metric
  `retention_rows_total{rule}` (hàng đã xoá) và gauge `retention_eligible_rows{rule}` (hàng đủ điều kiện ở lần dry-run gần nhất).

## 3. Trigger point theo từng loại (không chen vào luồng chính — chỉ thêm, không đổi logic gốc)

| Type              | Nơi gọi                                                                   | Payload                                            | Lưu ý                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_confirmed` | Matcher chốt cặp (hoặc `MatchingService.confirmTicket` legacy)            | `{ sessionId, matchType }`                         | **KHÔNG bao giờ có partnerId/nickname** — Soul Match ẩn danh tới khi unlock (docs/06); lộ danh tính qua notification phá toàn bộ giá trị ẩn danh, xem docs/10 § Soul Match                                                                        |
| `friend_message`  | `FriendService.sendMessage` sau khi message persist                       | `{ conversationId, senderUserId, preview }`        | Friend Chat KHÔNG ẩn danh (đã unlock) nên lộ senderUserId là ĐÚNG, không phải bug (khác Soul Match). Gộp theo cửa sổ: chỉ tin đầu mỗi `FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS` của (người nhận, hội thoại) tạo notification — xem friend-service.md |
| `gift_received`   | `GiftService.sendGift` trong `withinTransaction` (economy-service.md § 6) | `{ roomId, senderUserId, giftCode, priceDiamond }` | Party Room không ẩn danh — sender lộ là đúng                                                                                                                                                                                                      |
| `post_liked`      | `FeedService.like`                                                        | `{ postId, actorUserId }`                          | Bỏ qua nếu actor = author (không tự notify chính mình)                                                                                                                                                                                            |
| `post_commented`  | `FeedService.createComment`                                               | `{ postId, commentId, actorUserId }`               | Tương tự — bỏ qua tự comment lên bài mình                                                                                                                                                                                                         |

## 4. Push — isolated provider adapters

Business code chỉ phụ thuộc `PushNotificationPort` tại `common/platform`; `Dev`, `Disabled`, FCM
HTTP v1 và APNs HTTP/2 là các adapter được chọn bởi `NOTIFICATION_PUSH_PROVIDER`. `dev` bị chặn ở
production; `disabled` chỉ bỏ external push nên row in-app vẫn được persist. FCM/APNs không log
device token, payload hay user id. Lỗi provider trả trạng thái thất bại/bị nuốt ở boundary và không
được làm hỏng transaction chính.

Adapter nhận device token khi caller có token. Với web, `WebPushSubscriptionService` lưu endpoint
VAPID của từng user qua `POST /notifications/web-push/subscription`; Service Worker nhận payload
khi tab đã đóng và mở đúng `/chat/:senderUserId` khi click. Endpoint 404/410 bị xoá tự động.
Web push tắt mặc định; chỉ bật khi có đủ `WEB_PUSH_SUBJECT`, `WEB_PUSH_PUBLIC_KEY` và
`WEB_PUSH_PRIVATE_KEY`. Luồng đăng ký/rotate token native vẫn chưa thuộc scope này.

Config provider: `NOTIFICATION_PUSH_PROVIDER` (`dev` | `fcm` | `apns` | `disabled`, default `dev`),
`NOTIFICATION_PUSH_HTTP_TIMEOUT_MS` và credential tương ứng `NOTIFICATION_FCM_*` hoặc
`NOTIFICATION_APNS_*`. Production không có credential/token phải chọn `disabled`, không fallback về
`dev`.

Web Push config: `WEB_PUSH_ENABLED` (default `false`), `WEB_PUSH_SUBJECT`,
`WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` và frontend `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`.

## 5. Analytics — optional PostHog adapter

Business code chỉ gọi `AnalyticsPort`; `PostHogAnalyticsAdapter` dùng server capture API và không
import `posthog-js`. `ANALYTICS_ENABLED=false` hoặc `ANALYTICS_PROVIDER=disabled` chọn no-op.
Provider failure được log bằng thông điệp tổng quát và bỏ qua; key nhạy cảm như token, secret,
OTP, receipt, message, email, phone và IP bị loại khỏi properties trước khi gửi.

Config: `ANALYTICS_ENABLED`, `ANALYTICS_PROVIDER` (`posthog` | `disabled`), `POSTHOG_PROJECT_TOKEN`,
`POSTHOG_HOST` và `ANALYTICS_HTTP_TIMEOUT_MS`.

## 6. API

- `GET /notifications` — cursor, mới nhất trước.
- `GET /notifications/unread-count` — badge số chưa đọc.
- `POST /notifications/web-push/subscription` — đăng ký/cập nhật browser endpoint.
- `DELETE /notifications/web-push/subscription` — huỷ browser endpoint của chính user.
- `POST /notifications/:id/read` — đánh dấu đã đọc, idempotent, chỉ chủ sở hữu.

### 6.1 Admin broadcast chạy nền (`admin_broadcast`, ADR 0013)

`POST /admin/notifications/broadcast` (quyền `ManageConfig`) **chỉ xếp hàng**: ghi một dòng `notification_broadcasts` (`queued`) + audit
`notification.broadcast.queued` cùng transaction rồi trả `202 { broadcastId, status }` — không nạp user vào RAM, không ghi hàng triệu dòng
trong request. `GET /admin/notifications/broadcast/:id` trả tiến độ (`status`, `recipientCount` tăng dần, `lastError`).

`BroadcastDispatchJob` (module Admin, cluster singleton, mỗi `ADMIN_BROADCAST_JOB_INTERVAL_MS`) duyệt user active theo keyset
`users.id`, mỗi lô `ADMIN_BROADCAST_BATCH_SIZE` người, tối đa `ADMIN_BROADCAST_MAX_BATCHES_PER_TICK` lô mỗi tick (trần lý thuyết
5.000 người/giây khi tick xong trong 2 giây; thực tế thấp hơn tuỳ tốc độ ghi DB và push — chưa đo). Với mỗi lô: đọc trang user + lọc VIP/Free (`EconomyService.filterActiveVipUserIds`, theo lô)
**trước** transaction; trong transaction ngắn chỉ khoá dòng broadcast (kiểm tra cursor còn như lúc đọc), INSERT lô thông báo và cập
nhật `cursor_user_id`/`recipient_count` — nên **đúng-một-lần cho in-app**: pod chết giữa chừng thì tick sau chạy tiếp từ cursor đã
commit; hai runner chồng nhau (failover) không gửi trùng một lô. Trang ngắn hơn lô thì hoàn tất ngay (audit
`notification.broadcast.completed` kèm số người nhận thật).

- **Tập người nhận** = user `active` đã tồn tại lúc tạo broadcast (so sánh `created_at` theo mili giây); tài khoản đăng ký sau đó và
  user bị ban không nhận. Audience `vip`/`free` tính theo ví **tại lúc lô được xử lý**, không phải lúc bấm gửi.
- **Push** vẫn best-effort, gửi SAU khi lô commit, tối đa 20 lời gọi đồng thời mỗi lô. Pod chết giữa commit và push thì lô đó
  mất push nhưng vẫn có thông báo in-app. Push theo từng người là điểm nghẽn thật ở quy mô triệu — cần provider hỗ trợ
  topic/batch (quyết định riêng).
- **Lỗi**: lô lỗi rollback sạch, ghi `failure_count`/`last_error` và thử lại tick sau; 5 lần liên tiếp thì `failed` + audit
  `notification.broadcast.failed` (không chặn broadcast sau).
- **Idempotency-Key bắt buộc** ở `POST`: unique một phần `(actor_user_id, idempotency_key)`. Gửi lại cùng khoá + cùng nội dung (bấm đúp,
  retry sau lỗi mạng) trả LẠI broadcast đã tạo, không bản thứ hai, không audit lần hai; cùng khoá nhưng khác nội dung → 409
  `ADMIN_BROADCAST_IDEMPOTENCY_CONFLICT`; hai request đồng thời cùng khoá → đúng một broadcast. Admin UI giữ một khoá cho mỗi nội dung.
- **Huỷ**: `POST /admin/notifications/broadcast/:id/cancel` (idempotent) chuyển `queued`/`running` → `cancelled`; job chỉ nhặt broadcast
  `queued`/`running` và khoá dòng trước mỗi lô nên lô đang chạy dở hoàn tất rồi dừng. Các lô ĐÃ commit không thu hồi được (thông báo đã
  tới người dùng); audit `notification.broadcast.cancelled` ghi `recipientCountAtCancel`. `completed`/`failed` → 409
  `ADMIN_BROADCAST_NOT_CANCELLABLE`.

## 7. Ngoài scope GĐ4

- Native device-token registration/rotation và preference theo từng loại notification — cần contract
  backend/native riêng.
- Notification preference (tắt riêng từng loại) — chưa có, mọi loại luôn bật.
- Soul Match message (ẩn danh, cửa sổ ngắn 2-3 phút) KHÔNG có notification — giá trị thấp do phòng
  đóng nhanh, ẩn danh cũng khiến payload khó thiết kế đúng như `friend_message`.
